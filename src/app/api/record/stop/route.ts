import { NextResponse } from "next/server";
import { setCaptureMode, getRecordStartedAt, setRecordStartedAt } from "@/lib/device-config";
import { stopUnit } from "@/lib/systemctl";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readdir, stat } from "fs/promises";
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

/** Find the active recording file using RECORD_STARTED_AT + file birthtime */
async function findActiveFile(startedAt: number): Promise<string | null> {
  try {
    const files = await readdir(RECORDINGS_DIR);
    const mp3Files = files.filter((f) => f.endsWith(".mp3"));
    if (mp3Files.length === 0) return null;

    const withStats = await Promise.all(
      mp3Files.map(async (f) => {
        const s = await stat(join(RECORDINGS_DIR, f));
        return { name: f, mtime: s.mtimeMs, btime: s.birthtimeMs };
      })
    );

    // Filter to files born after recording started (with 2s tolerance)
    const candidates = withStats.filter((f) => f.btime >= startedAt - 2000);
    if (candidates.length === 0) return null;

    // Pick the most recently modified one
    candidates.sort((a, b) => b.mtime - a.mtime);
    return candidates[0].name;
  } catch {
    return null;
  }
}

export async function POST() {
  try {
    // Read the start timestamp BEFORE clearing it — we need it to find the file
    const startedAt = await getRecordStartedAt();

    await setCaptureMode({ record: false });
    await setRecordStartedAt(null);

    // Stop the recorder
    await stopUnit("auris-record");

    // Find the active recording file and update DB with final metadata
    if (startedAt) {
      await new Promise((r) => setTimeout(r, 500));
      const activeFile = await findActiveFile(startedAt);
      if (activeFile) {
        const db = getDb();
        const filePath = join(RECORDINGS_DIR, activeFile);
        try {
          const s = await stat(filePath);
          const duration = await getDuration(filePath);
          await db
            .update(recordings)
            .set({ size: s.size, duration })
            .where(eq(recordings.filename, activeFile));
          // Fire-and-forget waveform generation
          generateWaveform(filePath)
            .then((peaks) => {
              const json = JSON.stringify(peaks);
              return db
                .update(recordings)
                .set({ waveform: json, waveformHash: hashWaveform(json) })
                .where(eq(recordings.filename, activeFile));
            })
            .catch(() => {});
        } catch {
          // ignore metadata update failure
        }
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
