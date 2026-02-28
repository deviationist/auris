import { NextResponse } from "next/server";
import { getCaptureMode, setCaptureMode } from "@/lib/device-config";
import { isActive, stopUnit, restartUnit } from "@/lib/systemctl";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { stat } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { generateWaveform, hashWaveform } from "@/lib/waveform";

const execFileAsync = promisify(execFile);
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

async function getDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ]);
    const secs = parseFloat(stdout.trim());
    return isNaN(secs) ? null : secs;
  } catch {
    return null;
  }
}

export async function POST() {
  try {
    // Find the active recording (size is null) before stopping
    const db = getDb();
    const [activeRec] = await db
      .select({ filename: recordings.filename })
      .from(recordings)
      .where(isNull(recordings.size))
      .limit(1);

    const mode = await getCaptureMode();
    await setCaptureMode({ record: false });

    const active = await isActive("auris-capture");
    if (active) {
      if (mode.stream) {
        await restartUnit("auris-capture");
      } else {
        await stopUnit("auris-capture");
      }
    }

    // Update DB with final metadata
    if (activeRec) {
      await new Promise((r) => setTimeout(r, 500));
      const filePath = join(RECORDINGS_DIR, activeRec.filename);
      try {
        const s = await stat(filePath);
        const duration = await getDuration(filePath);
        await db
          .update(recordings)
          .set({ size: s.size, duration })
          .where(eq(recordings.filename, activeRec.filename));
        // Fire-and-forget waveform generation
        generateWaveform(filePath)
          .then((peaks) => {
            const json = JSON.stringify(peaks);
            return db
              .update(recordings)
              .set({ waveform: json, waveformHash: hashWaveform(json) })
              .where(eq(recordings.filename, activeRec.filename));
          })
          .catch(() => {});
      } catch {
        // ignore metadata update failure
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to stop recording", detail: String(error) },
      { status: 500 }
    );
  }
}
