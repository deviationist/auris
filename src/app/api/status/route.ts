import { NextResponse } from "next/server";
import { isActive } from "@/lib/systemctl";
import { getCaptureMode } from "@/lib/device-config";
import { readdir, stat } from "fs/promises";
import { join } from "path";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [active, mode] = await Promise.all([
      isActive("auris-capture"),
      getCaptureMode(),
    ]);

    const streaming = active && mode.stream;
    const recording = active && mode.record;

    let recording_file: string | null = null;
    if (recording) {
      try {
        const files = await readdir(RECORDINGS_DIR);
        const mp3Files = files.filter((f) => f.endsWith(".mp3"));
        if (mp3Files.length > 0) {
          const withStats = await Promise.all(
            mp3Files.map(async (f) => {
              const s = await stat(join(RECORDINGS_DIR, f));
              return { name: f, mtime: s.mtimeMs };
            })
          );
          withStats.sort((a, b) => b.mtime - a.mtime);
          recording_file = withStats[0].name;
        }
      } catch {
        // recordings dir may not exist yet
      }
    }

    return NextResponse.json({ streaming, recording, recording_file });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get status", detail: String(error) },
      { status: 500 }
    );
  }
}
