import { NextResponse } from "next/server";
import { setCaptureMode, getSelectedDevice } from "@/lib/device-config";
import { isActive, startUnit, restartUnit } from "@/lib/systemctl";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { readdir, stat } from "fs/promises";
import { join } from "path";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

export async function POST() {
  try {
    const device = await getSelectedDevice();
    await setCaptureMode({ record: true });

    const active = await isActive("auris-capture");
    if (active) {
      await restartUnit("auris-capture");
    } else {
      await startUnit("auris-capture");
    }

    // capture.sh creates files as YYYY-MM-DD_HH-MM-SS.mp3
    // Wait for ffmpeg to create the file, then insert into DB
    await new Promise((r) => setTimeout(r, 500));

    const files = await readdir(RECORDINGS_DIR);
    const mp3Files = files.filter((f) => f.endsWith(".mp3"));
    const withStats = await Promise.all(
      mp3Files.map(async (f) => ({
        name: f,
        mtime: (await stat(join(RECORDINGS_DIR, f))).mtimeMs,
      }))
    );
    withStats.sort((a, b) => b.mtime - a.mtime);
    const filename = withStats[0]?.name;

    if (filename) {
      const db = getDb();
      await db
        .insert(recordings)
        .values({
          filename,
          device,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start recording", detail: String(error) },
      { status: 500 }
    );
  }
}
