import { spawn, execFile, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { promisify } from "util";
import { join } from "path";
import { writeFile, unlink, stat } from "fs/promises";
import { createWriteStream, type WriteStream } from "fs";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateWaveform, hashWaveform } from "@/lib/waveform";
import { generateTranscription, enqueueTranscription, setTranscriptionProgress, clearTranscriptionProgress, createTranscriptionAbort } from "@/lib/transcription";
import { getRecordDevice, getVoxConfig, getWhisperEnabled, type VoxConfig } from "@/lib/device-config";
import { listCaptureDevices } from "@/lib/alsa";

const execFileAsync = promisify(execFile);
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

export type VoxState = "idle" | "monitoring" | "recording" | "tail_silence" | "finalizing";

export interface VoxStatus {
  active: boolean;
  state: VoxState;
  currentLevel: number;
  threshold: number;
  recordingDuration: number;
  recordingFilename: string | null;
  silenceRemaining: number;
  config: VoxConfig;
}

export interface VoxLevelEvent {
  state: VoxState;
  currentLevel: number;
  threshold: number;
  recordingDuration: number;
  recordingFilename: string | null;
  silenceRemaining: number;
}

// --- Event emitter for SSE streaming ---

const _globalEmitter = globalThis as unknown as { _voxEmitter?: EventEmitter };
if (!_globalEmitter._voxEmitter) {
  _globalEmitter._voxEmitter = new EventEmitter();
  _globalEmitter._voxEmitter.setMaxListeners(20);
}

export function getVoxEmitter(): EventEmitter {
  return _globalEmitter._voxEmitter!;
}

// --- Circular PCM Buffer ---

class CircularPcmBuffer {
  private chunks: Buffer[] = [];
  private totalBytes = 0;
  private maxBytes: number;

  constructor(maxSeconds: number, sampleRate: number = 16000) {
    // s16le mono = 2 bytes per sample
    this.maxBytes = maxSeconds * sampleRate * 2;
  }

  push(chunk: Buffer) {
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;
    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift()!;
      this.totalBytes -= removed.length;
    }
  }

  drain(): Buffer[] {
    const result = this.chunks;
    this.chunks = [];
    this.totalBytes = 0;
    return result;
  }

  clear() {
    this.chunks = [];
    this.totalBytes = 0;
  }

  updateMaxSeconds(maxSeconds: number, sampleRate: number = 16000) {
    this.maxBytes = maxSeconds * sampleRate * 2;
  }
}

// --- RMS computation ---

function computeRmsDb(chunk: Buffer): number {
  const samples = new Int16Array(
    chunk.buffer,
    chunk.byteOffset,
    Math.floor(chunk.length / 2)
  );
  if (samples.length === 0) return -96;

  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSq / samples.length);
  if (rms === 0) return -96;
  return 20 * Math.log10(rms / 32768);
}

// --- globalThis singleton ---

interface VoxInstance {
  state: VoxState;
  config: VoxConfig;
  ffmpeg: ChildProcess | null;
  preBuffer: CircularPcmBuffer;
  currentLevel: number;
  smoothedLevel: number;
  triggerStart: number | null; // when level first exceeded threshold
  recordStart: number | null;
  silenceStart: number | null;
  tempPcmPath: string | null;
  tempWriteStream: WriteStream | null;
  recordingFilename: string | null;
  lastEmitTime: number;
}

const _global = globalThis as unknown as { _voxInstance?: VoxInstance };

function getInstance(): VoxInstance | undefined {
  return _global._voxInstance;
}

// --- Public API ---

export async function startVox(configOverrides?: Partial<VoxConfig>): Promise<void> {
  if (_global._voxInstance?.state !== undefined && _global._voxInstance.state !== "idle") {
    throw new Error("VOX is already active");
  }

  const config = { ...(await getVoxConfig()), ...configOverrides };
  const device = await getRecordDevice();

  const preBuffer = new CircularPcmBuffer(config.preBufferSecs);

  const instance: VoxInstance = {
    state: "monitoring",
    config,
    ffmpeg: null,
    preBuffer,
    currentLevel: -96,
    smoothedLevel: -96,
    triggerStart: null,
    recordStart: null,
    silenceStart: null,
    tempPcmPath: null,
    tempWriteStream: null,
    recordingFilename: null,
    lastEmitTime: 0,
  };

  _global._voxInstance = instance;

  // Spawn ffmpeg for ALSA → PCM
  const ffmpeg = spawn("ffmpeg", [
    "-f", "alsa",
    "-i", device,
    "-f", "s16le",
    "-ac", "1",
    "-ar", "16000",
    "-v", "quiet",
    "pipe:1",
  ]);

  instance.ffmpeg = ffmpeg;

  ffmpeg.stdout.on("data", (chunk: Buffer) => {
    processChunk(instance, chunk);
  });

  ffmpeg.stderr.on("data", () => {});

  ffmpeg.on("close", () => {
    // If ffmpeg exits unexpectedly while active, clean up
    if (instance.state !== "idle") {
      console.log("[vox] ffmpeg exited, cleaning up");
      cleanupInstance(instance);
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("[vox] ffmpeg error:", err.message);
    cleanupInstance(instance);
  });

  console.log("[vox] Started monitoring (device: %s, threshold: %d dB)", device, config.threshold);
}

export async function stopVox(): Promise<void> {
  const instance = getInstance();
  if (!instance) return;

  if (instance.state === "recording" || instance.state === "tail_silence") {
    // Finalize current recording before stopping
    await finalizeRecording(instance);
  }

  cleanupInstance(instance);
  console.log("[vox] Stopped");
}

export function isVoxActive(): boolean {
  const instance = getInstance();
  return instance !== undefined && instance.state !== "idle";
}

export function isVoxRecording(): boolean {
  const instance = getInstance();
  return instance !== undefined && (instance.state === "recording" || instance.state === "tail_silence" || instance.state === "finalizing");
}

export function updateVoxConfig(config: Partial<VoxConfig>): void {
  const instance = getInstance();
  if (!instance || instance.state === "idle") return;

  if (config.threshold !== undefined) instance.config.threshold = config.threshold;
  if (config.triggerMs !== undefined) instance.config.triggerMs = config.triggerMs;
  if (config.preBufferSecs !== undefined) {
    instance.config.preBufferSecs = config.preBufferSecs;
    instance.preBuffer.updateMaxSeconds(config.preBufferSecs);
  }
  if (config.postSilenceSecs !== undefined) instance.config.postSilenceSecs = config.postSilenceSecs;
}

export async function stopCurrentRecording(): Promise<boolean> {
  const instance = getInstance();
  if (!instance || (instance.state !== "recording" && instance.state !== "tail_silence")) {
    return false;
  }

  instance.state = "finalizing";
  try {
    await finalizeRecording(instance);
  } catch (err) {
    console.error("[vox] Finalize error:", err);
  }
  if (instance === getInstance()) {
    instance.state = "monitoring";
    instance.triggerStart = null;
  }
  return true;
}

export function getVoxStatus(): VoxStatus {
  const instance = getInstance();
  if (!instance || instance.state === "idle") {
    return {
      active: false,
      state: "idle",
      currentLevel: -96,
      threshold: -30,
      recordingDuration: 0,
      recordingFilename: null,
      silenceRemaining: 0,
      config: { threshold: -30, triggerMs: 500, preBufferSecs: 5, postSilenceSecs: 10 },
    };
  }

  let recordingDuration = 0;
  if (instance.recordStart) {
    recordingDuration = (Date.now() - instance.recordStart) / 1000;
  }

  let silenceRemaining = 0;
  if (instance.state === "tail_silence" && instance.silenceStart) {
    const elapsed = (Date.now() - instance.silenceStart) / 1000;
    silenceRemaining = Math.max(0, instance.config.postSilenceSecs - elapsed);
  }

  return {
    active: true,
    state: instance.state,
    currentLevel: Math.round(instance.smoothedLevel * 10) / 10,
    threshold: instance.config.threshold,
    recordingDuration,
    recordingFilename: instance.recordingFilename,
    silenceRemaining: Math.round(silenceRemaining * 10) / 10,
    config: instance.config,
  };
}

// --- Internal ---

const EMA_ALPHA = 0.3; // Smoothing factor for exponential moving average

function processChunk(instance: VoxInstance, chunk: Buffer) {
  if (instance.state === "idle" || instance.state === "finalizing") return;

  const rawDb = computeRmsDb(chunk);
  instance.currentLevel = rawDb;
  instance.smoothedLevel = EMA_ALPHA * rawDb + (1 - EMA_ALPHA) * instance.smoothedLevel;

  const level = instance.smoothedLevel;
  const threshold = instance.config.threshold;
  const now = Date.now();

  // Throttled SSE emit at ~15Hz
  if (now - instance.lastEmitTime >= 67) {
    instance.lastEmitTime = now;
    _globalEmitter._voxEmitter?.emit("level", buildLevelEvent(instance));
  }

  switch (instance.state) {
    case "monitoring":
      // Always buffer PCM for pre-buffer
      instance.preBuffer.push(chunk);

      if (level > threshold) {
        if (!instance.triggerStart) {
          instance.triggerStart = now;
        } else if (now - instance.triggerStart >= instance.config.triggerMs) {
          // Trigger! Start recording
          startRecordingSegment(instance);
        }
      } else {
        instance.triggerStart = null;
      }
      break;

    case "recording":
      // Write to temp file
      instance.tempWriteStream?.write(chunk);

      if (level < threshold) {
        // Start tail silence
        instance.state = "tail_silence";
        instance.silenceStart = now;
      }
      break;

    case "tail_silence":
      // Write to temp file (still recording during tail)
      instance.tempWriteStream?.write(chunk);

      if (level > threshold) {
        // Sound returned — go back to recording
        instance.state = "recording";
        instance.silenceStart = null;
      } else if (now - (instance.silenceStart || now) >= instance.config.postSilenceSecs * 1000) {
        // Silence exceeded — finalize
        instance.state = "finalizing";
        finalizeRecording(instance).then(() => {
          if (instance === getInstance()) {
            instance.state = "monitoring";
            instance.triggerStart = null;
          }
        }).catch((err) => {
          console.error("[vox] Finalize error:", err);
          if (instance === getInstance()) {
            instance.state = "monitoring";
            instance.triggerStart = null;
          }
        });
      }
      break;
  }
}

function startRecordingSegment(instance: VoxInstance) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `${timestamp}-vox.mp3`;
  const tempPcmPath = join(RECORDINGS_DIR, `${timestamp}-vox.pcm`);

  instance.state = "recording";
  instance.recordStart = Date.now();
  instance.silenceStart = null;
  instance.tempPcmPath = tempPcmPath;
  instance.recordingFilename = filename;

  // Open write stream
  instance.tempWriteStream = createWriteStream(tempPcmPath);

  // Drain pre-buffer into the file
  const preChunks = instance.preBuffer.drain();
  for (const chunk of preChunks) {
    instance.tempWriteStream.write(chunk);
  }

  console.log("[vox] Recording started: %s", filename);
}

async function finalizeRecording(instance: VoxInstance): Promise<void> {
  const tempPcmPath = instance.tempPcmPath;
  const filename = instance.recordingFilename;

  // Close write stream
  if (instance.tempWriteStream) {
    await new Promise<void>((resolve) => {
      instance.tempWriteStream!.end(resolve);
    });
    instance.tempWriteStream = null;
  }

  instance.recordStart = null;
  instance.silenceStart = null;
  instance.tempPcmPath = null;
  instance.recordingFilename = null;

  if (!tempPcmPath || !filename) return;

  const mp3Path = join(RECORDINGS_DIR, filename);

  try {
    // Encode PCM → MP3
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-f", "s16le",
        "-ac", "1",
        "-ar", "16000",
        "-i", tempPcmPath,
        "-codec:a", "libmp3lame",
        "-b:a", "128k",
        "-ar", "44100",
        "-ac", "1",
        "-v", "quiet",
        "-y",
        mp3Path,
      ]);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg encode exited with code ${code}`));
      });
      proc.on("error", reject);
    });

    // Delete temp PCM
    await unlink(tempPcmPath).catch(() => {});

    // Get file stats and duration
    const fileStat = await stat(mp3Path);
    let duration: number | null = null;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        mp3Path,
      ]);
      const secs = parseFloat(stdout.trim());
      if (!isNaN(secs)) duration = secs;
    } catch {}

    // Get device name
    let deviceName: string | undefined;
    try {
      const alsaId = await getRecordDevice();
      const devices = await listCaptureDevices();
      deviceName = devices.find((d) => d.alsaId === alsaId)?.name;
    } catch {}

    // Register in DB
    const db = getDb();
    await db.insert(recordings).values({
      filename,
      device: deviceName,
      size: fileStat.size,
      duration,
      metadata: JSON.stringify({ source: "vox" }),
      createdAt: new Date(),
    }).onConflictDoNothing();

    console.log("[vox] Recording finalized: %s (%.1fs)", filename, duration ?? 0);

    // Fire-and-forget waveform generation
    generateWaveform(mp3Path)
      .then((peaks) => {
        const json = JSON.stringify(peaks);
        return db
          .update(recordings)
          .set({ waveform: json, waveformHash: hashWaveform(json) })
          .where(eq(recordings.filename, filename));
      })
      .catch(() => {});

    // Fire-and-forget transcription
    if (await getWhisperEnabled()) {
      setTranscriptionProgress(filename, 0);
      const signal = createTranscriptionAbort(filename);
      enqueueTranscription(filename, async () => {
        if (signal.aborted) throw new Error("Transcription cancelled");
        await db.update(recordings).set({ transcriptionStatus: "processing" }).where(eq(recordings.filename, filename));
        const result = await generateTranscription(mp3Path, { onProgress: (pct) => setTranscriptionProgress(filename, pct), signal });
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
    console.error("[vox] Failed to finalize recording:", err);
    // Clean up temp file on error
    await unlink(tempPcmPath).catch(() => {});
  }
}

function cleanupInstance(instance: VoxInstance) {
  if (instance.ffmpeg) {
    instance.ffmpeg.kill("SIGTERM");
    instance.ffmpeg = null;
  }
  if (instance.tempWriteStream) {
    instance.tempWriteStream.end();
    instance.tempWriteStream = null;
  }
  // Clean up temp PCM file if still around
  if (instance.tempPcmPath) {
    unlink(instance.tempPcmPath).catch(() => {});
    instance.tempPcmPath = null;
  }
  instance.preBuffer.clear();
  instance.state = "idle";
  instance.currentLevel = -96;
  instance.smoothedLevel = -96;
  instance.triggerStart = null;
  instance.recordStart = null;
  instance.silenceStart = null;
  instance.recordingFilename = null;
  _global._voxInstance = undefined;
  _globalEmitter._voxEmitter?.emit("close");
}

function buildLevelEvent(instance: VoxInstance): VoxLevelEvent {
  let recordingDuration = 0;
  if (instance.recordStart) {
    recordingDuration = (Date.now() - instance.recordStart) / 1000;
  }
  let silenceRemaining = 0;
  if (instance.state === "tail_silence" && instance.silenceStart) {
    const elapsed = (Date.now() - instance.silenceStart) / 1000;
    silenceRemaining = Math.max(0, instance.config.postSilenceSecs - elapsed);
  }
  return {
    state: instance.state,
    currentLevel: Math.round(instance.smoothedLevel * 10) / 10,
    threshold: instance.config.threshold,
    recordingDuration,
    recordingFilename: instance.recordingFilename,
    silenceRemaining: Math.round(silenceRemaining * 10) / 10,
  };
}
