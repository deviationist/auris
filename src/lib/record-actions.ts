import { setCaptureMode, getCaptureMode, getRecordStartedAt, setRecordStartedAt, getRecordChunkMinutes, getRecordChunkPart, setRecordChunkPart } from "@/lib/device-config";
import { isActive, startUnit, stopUnit } from "@/lib/systemctl";
import { isVoxActive, stopVox } from "@/lib/vox";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { generateWaveform, hashWaveform } from "@/lib/waveform";
import { generateTranscription, enqueueTranscription, setTranscriptionProgress, clearTranscriptionProgress, createTranscriptionAbort } from "@/lib/transcription";
import { scheduleChunk, cancelChunk } from "@/lib/record-chunker";

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

    const candidates = withStats.filter((f) => f.btime >= startedAt - 2000);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.mtime - a.mtime);
    return candidates[0].name;
  } catch {
    return null;
  }
}

export async function startRecording(chunkPart?: number): Promise<void> {
  // Stop VOX if active (they share the ALSA device)
  if (isVoxActive()) {
    await stopVox();
  }

  const startedAt = Date.now();
  const chunkMinutes = await getRecordChunkMinutes();

  // Set part number before starting the unit (record.sh reads it)
  if (chunkMinutes > 0) {
    await setRecordChunkPart(chunkPart ?? 1);
  } else {
    await setRecordChunkPart(null);
  }

  await setCaptureMode({ record: true });
  await setRecordStartedAt(startedAt);

  // Ensure the Icecast stream is running before starting the recorder
  // (record.sh reads from Icecast, not ALSA directly)
  const streamActive = await isActive("auris-stream");
  if (!streamActive) {
    await startUnit("auris-stream");
    // Give Icecast a moment to accept the source
    await new Promise((r) => setTimeout(r, 1500));
  }

  await startUnit("auris-record");

  scheduleChunk(chunkMinutes, startedAt);
}

/** Stop recording. Returns the chunk part number (0 if not chunking). */
export async function stopRecording(): Promise<number> {
  cancelChunk();

  const startedAt = await getRecordStartedAt();
  const currentPart = await getRecordChunkPart();

  await setCaptureMode({ record: false });
  await setRecordStartedAt(null);
  await setRecordChunkPart(null);
  await stopUnit("auris-record");

  // Stop the Icecast stream if user isn't also listening
  const mode = await getCaptureMode();
  if (!mode.stream) {
    await stopUnit("auris-stream");
  }

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
        // Fire-and-forget transcription (queued, serial)
        setTranscriptionProgress(activeFile, 0);
        const signal = createTranscriptionAbort(activeFile);
        enqueueTranscription(async () => {
          if (signal.aborted) throw new Error("Transcription cancelled");
          await db.update(recordings).set({ transcriptionStatus: "processing" }).where(eq(recordings.filename, activeFile));
          const result = await generateTranscription(filePath, { onProgress: (pct) => setTranscriptionProgress(activeFile, pct), signal });
          const stored = result.segments.length > 0 ? JSON.stringify({ text: result.text, segments: result.segments }) : result.text;
          await db.update(recordings).set({ transcription: stored, transcriptionLang: result.language, transcriptionStatus: "done" }).where(eq(recordings.filename, activeFile));
          clearTranscriptionProgress(activeFile);
        }).catch(() => {
          clearTranscriptionProgress(activeFile);
          if (!signal.aborted) {
            db.update(recordings).set({ transcriptionStatus: "error" }).where(eq(recordings.filename, activeFile)).catch(() => {});
          }
        });
      } catch {
        // ignore metadata update failure
      }
    }
  }

  return currentPart;
}
