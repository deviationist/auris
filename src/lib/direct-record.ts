import { spawn, execFile as execFileCb, type ChildProcess } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { stat } from "fs/promises";
import { getRecordDevice, getRecordBitrate, getCompressorConfig, getRecordChunkPart, getWhisperEnabled } from "@/lib/device-config";
import { listCaptureDevices } from "@/lib/alsa";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateWaveform, hashWaveform } from "@/lib/waveform";
import { enqueueTranscription, setTranscriptionProgress, clearTranscriptionProgress, createTranscriptionAbort, generateTranscription } from "@/lib/transcription";

const execFileAsync = promisify(execFileCb);
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

// globalThis singleton to survive HMR and share state with API routes
const g = globalThis as typeof globalThis & {
  __directRecord?: DirectRecordState | null;
};

interface DirectRecordState {
  ffmpeg: ChildProcess;
  filename: string;
  filePath: string;
  startedAt: number;
  device: string;
}

function getState(): DirectRecordState | null {
  return g.__directRecord ?? null;
}

function setState(v: DirectRecordState | null) {
  g.__directRecord = v;
}

export function isDirectRecording(): boolean {
  return getState() !== null;
}

export function getDirectRecordingInfo(): { filename: string; startedAt: number } | null {
  const state = getState();
  if (!state) return null;
  return { filename: state.filename, startedAt: state.startedAt };
}

function buildCompressorFilter(config: { enabled: boolean; threshold: number; ratio: number; makeup: number; attack: number; release: number }): string[] {
  if (!config.enabled) return [];
  return ["-af", `acompressor=threshold=${config.threshold}dB:ratio=${config.ratio}:makeup=${config.makeup}dB:attack=${config.attack}:release=${config.release}`];
}

function generateFilename(chunkPart?: number): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const partSuffix = chunkPart && chunkPart > 0 ? `-part-${chunkPart}` : "";
  return `${date}_${time}${partSuffix}.mp3`;
}

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

export async function startDirectRecording(chunkPart?: number): Promise<string> {
  if (getState()) {
    throw new Error("Already recording");
  }

  const [device, bitrate, compressor] = await Promise.all([
    getRecordDevice(),
    getRecordBitrate(),
    getCompressorConfig(),
  ]);

  const part = chunkPart ?? await getRecordChunkPart();
  const filename = generateFilename(part > 0 ? part : undefined);
  const filePath = join(RECORDINGS_DIR, filename);
  const compressorFilter = buildCompressorFilter(compressor);

  console.log(`[direct-record] starting: ${device} → ${filename} (${bitrate}, compressor: ${compressor.enabled})`);

  const ffmpeg = spawn("ffmpeg", [
    "-f", "alsa",
    "-i", device,
    ...compressorFilter,
    "-acodec", "libmp3lame",
    "-ab", bitrate,
    "-ar", "44100",
    "-ac", "1",
    "-v", "quiet",
    "-y",
    filePath,
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  const startedAt = Date.now();
  const state: DirectRecordState = { ffmpeg, filename, filePath, startedAt, device };
  setState(state);

  ffmpeg.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[direct-record:ffmpeg] ${line}`);
  });

  ffmpeg.on("error", (err) => {
    console.error(`[direct-record] ffmpeg error: ${err.message}`);
    if (getState()?.ffmpeg === ffmpeg) setState(null);
  });

  ffmpeg.on("exit", (code) => {
    console.log(`[direct-record] ffmpeg exited with code ${code}`);
    if (getState()?.ffmpeg === ffmpeg) setState(null);
  });

  // Register file in DB immediately
  let deviceName: string | undefined;
  try {
    const devices = await listCaptureDevices();
    deviceName = devices.find((d) => d.alsaId === device)?.name;
  } catch { /* ignore */ }

  const db = getDb();
  await db.insert(recordings).values({
    filename,
    device: deviceName,
    createdAt: new Date(startedAt),
  }).onConflictDoNothing();

  return filename;
}

export async function stopDirectRecording(): Promise<{ filename: string; chunkPart: number } | null> {
  const state = getState();
  if (!state) return null;

  const { ffmpeg, filename, filePath } = state;
  setState(null);

  console.log(`[direct-record] stopping: ${filename}`);

  // Gracefully stop ffmpeg by closing stdin (SIGINT-like)
  return new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      if (!ffmpeg.killed) {
        console.log("[direct-record] ffmpeg drain timeout, force killing");
        ffmpeg.kill("SIGKILL");
      }
    }, 5000);

    ffmpeg.on("exit", async () => {
      clearTimeout(killTimeout);

      // Wait briefly for file to be flushed
      await new Promise((r) => setTimeout(r, 300));

      // Finalize: update DB with size/duration, generate waveform, enqueue transcription
      try {
        const db = getDb();
        const s = await stat(filePath);
        const duration = await getDuration(filePath);
        await db.update(recordings).set({ size: s.size, duration }).where(eq(recordings.filename, filename));

        // Fire-and-forget waveform generation
        generateWaveform(filePath)
          .then((peaks) => {
            const json = JSON.stringify(peaks);
            return db.update(recordings).set({ waveform: json, waveformHash: hashWaveform(json) }).where(eq(recordings.filename, filename));
          })
          .catch(() => {});

        // Fire-and-forget transcription
        if (await getWhisperEnabled()) {
          setTranscriptionProgress(filename, 0);
          const signal = createTranscriptionAbort(filename);
          enqueueTranscription(filename, async () => {
            if (signal.aborted) throw new Error("Transcription cancelled");
            await db.update(recordings).set({ transcriptionStatus: "processing" }).where(eq(recordings.filename, filename));
            const result = await generateTranscription(filePath, { onProgress: (pct) => setTranscriptionProgress(filename, pct), signal });
            const stored = result.segments.length > 0 ? JSON.stringify({ text: result.text, segments: result.segments }) : result.text;
            await db.update(recordings).set({ transcription: stored, transcriptionLang: result.language, transcriptionStatus: "done" }).where(eq(recordings.filename, filename));
            clearTranscriptionProgress(filename);
          }).catch(() => {
            clearTranscriptionProgress(filename);
            if (!signal.aborted) {
              db.update(recordings).set({ transcriptionStatus: "error" }).where(eq(recordings.filename, filename)).catch(() => {});
            }
          });
        }
      } catch (err) {
        console.error(`[direct-record] finalization error:`, err);
      }

      const part = await getRecordChunkPart().catch(() => 0);
      resolve({ filename, chunkPart: part });
    });

    // Send SIGTERM for graceful stop (ffmpeg will flush and exit)
    ffmpeg.kill("SIGTERM");
  });
}
