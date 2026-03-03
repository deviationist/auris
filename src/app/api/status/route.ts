import { NextResponse } from "next/server";
import { isActive } from "@/lib/systemctl";
import { getRecordDevice, getRecordStartedAt } from "@/lib/device-config";
import { listCaptureDevices } from "@/lib/alsa";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readdir, stat } from "fs/promises";
import { join } from "path";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [streaming, recording] = await Promise.all([
      isActive("auris-stream"),
      isActive("auris-record"),
    ]);

    let recording_file: string | null = null;
    let recording_started: number | null = null;
    if (recording) {
      // Use the timestamp saved by record/start — this is the definitive
      // start time, independent of when ffmpeg creates the file on disk.
      recording_started = await getRecordStartedAt();
      if (!recording_started) {
        // Fallback if config was lost (e.g., manual systemctl start)
        recording_started = Date.now();
      }

      try {
        const files = await readdir(RECORDINGS_DIR);
        const mp3Files = files.filter((f) => f.endsWith(".mp3"));
        if (mp3Files.length > 0) {
          // Find the file that belongs to THIS recording session:
          // its birth/mtime must be after (or very close to) recording_started.
          const withStats = await Promise.all(
            mp3Files.map(async (f) => {
              const s = await stat(join(RECORDINGS_DIR, f));
              return { name: f, mtime: s.mtimeMs, btime: s.birthtimeMs };
            })
          );

          // Filter to files created after recording started (with 30s tolerance
          // for ffmpeg startup delay — file appears 10-15s after service start)
          const startedAt = recording_started;
          const candidates = withStats.filter(
            (f) => f.btime >= startedAt - 2000
          );

          if (candidates.length > 0) {
            // Pick the most recently modified one (should only be one)
            candidates.sort((a, b) => b.mtime - a.mtime);
            recording_file = candidates[0].name;

            // Ensure the active recording file is in the DB
            const db = getDb();
            const [existing] = await db
              .select({ filename: recordings.filename })
              .from(recordings)
              .where(eq(recordings.filename, recording_file))
              .limit(1);

            if (!existing) {
              let deviceName: string | undefined;
              try {
                const alsaId = await getRecordDevice();
                const devices = await listCaptureDevices();
                deviceName = devices.find((d) => d.alsaId === alsaId)?.name;
              } catch {
                // ignore — device name is optional
              }
              await db
                .insert(recordings)
                .values({
                  filename: recording_file,
                  device: deviceName,
                  createdAt: new Date(startedAt),
                })
                .onConflictDoNothing();
            }
          }
          // If no candidates found, the new file hasn't appeared yet — that's
          // fine, recording_file stays null and the UI shows the timer without
          // a filename until the file appears.
        }
      } catch {
        // recordings dir may not exist yet
      }
    }

    return NextResponse.json({ streaming, recording, recording_file, recording_started });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get status", detail: String(error) },
      { status: 500 }
    );
  }
}
