import { spawn, type ChildProcess } from "child_process";
import { getWhisperLanguage, getWhisperTranslate, getWhisperThreads, getWhisperVad } from "@/lib/device-config";

const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cpp";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "/opt/whisper.cpp/models/ggml-medium-q5_k.bin";

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
}

/** Run whisper.cpp on an audio file and return transcription text + language */
function runWhisper(audioPath: string, options?: { language?: string; translate?: boolean; model?: string; threads?: number; vad?: boolean; vadModel?: string; onProgress?: (pct: number) => void; signal?: AbortSignal }): Promise<TranscriptionResult> {
  const model = options?.model || WHISPER_MODEL;
  const lang = options?.language || "auto";
  const threads = options?.threads;

  return new Promise((resolve, reject) => {
    const args = [
      "-m", model,
      "-f", audioPath,
      "--print-progress",
      "-l", lang,
    ];
    if (options?.translate) {
      args.push("--translate");
    }
    if (threads && threads > 0) {
      args.push("-t", String(threads));
    }
    if (options?.vad) {
      args.push("--vad");
      if (options.vadModel) {
        args.push("-vm", options.vadModel);
      }
    }

    const proc = spawn(WHISPER_BIN, args, { detached: false });

    // Force-kill helper: SIGTERM first, SIGKILL after 2s if still alive
    const forceKill = () => {
      proc.kill("SIGTERM");
      const killTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 2000);
      proc.on("close", () => clearTimeout(killTimer));
    };

    // Handle abort signal — kill whisper process
    if (options?.signal) {
      if (options.signal.aborted) {
        forceKill();
        reject(new Error("Transcription cancelled"));
        return;
      }
      const onAbort = () => { forceKill(); };
      options.signal.addEventListener("abort", onAbort, { once: true });
      proc.on("close", () => options!.signal!.removeEventListener("abort", onAbort));
    }

    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      // Parse progress from stderr: "whisper_print_progress_callback: progress = XX%"
      const text = chunk.toString();
      const match = text.match(/progress\s*=\s*(\d+)%/);
      if (match && options?.onProgress) {
        options.onProgress(parseInt(match[1], 10));
      }
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString();
        reject(new Error(`whisper-cpp exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      const stdout = Buffer.concat(chunks).toString().trim();
      const stderr = Buffer.concat(stderrChunks).toString();

      // Extract detected language from stderr (whisper.cpp prints "auto-detected language: xx")
      let detectedLang = lang;
      const langMatch = stderr.match(/auto-detected language:\s*(\w+)/i);
      if (langMatch) detectedLang = langMatch[1];

      const { text, segments } = parseTimestampedOutput(stdout);
      resolve({ text, segments, language: detectedLang });
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`whisper-cpp not found at "${WHISPER_BIN}". Install whisper.cpp and ensure the binary is in PATH.`));
      } else {
        reject(err);
      }
    });
  });
}

/** Parse a timestamp like "00:00:05.120" into seconds */
function parseTimestamp(ts: string): number {
  const parts = ts.split(":");
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Parse whisper.cpp timestamped output: `[00:00:00.000 --> 00:00:05.120]  text` */
function parseTimestampedOutput(output: string): { text: string; segments: TranscriptionSegment[] } {
  const segments: TranscriptionSegment[] = [];
  const textParts: string[] = [];
  const lineRegex = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)$/;

  for (const line of output.split("\n")) {
    const match = line.match(lineRegex);
    if (match) {
      const segText = match[3].trim();
      segments.push({
        start: parseTimestamp(match[1]),
        end: parseTimestamp(match[2]),
        text: segText,
      });
      if (segText) textParts.push(segText);
    }
  }

  // Fallback: if no timestamps parsed, treat whole output as plain text
  if (segments.length === 0) {
    return { text: output, segments: [] };
  }

  return { text: textParts.join(" "), segments };
}

/** Parse stored transcription (JSON with segments or legacy plain text) */
export function parseStoredTranscription(raw: string | null): {
  text: string;
  segments: TranscriptionSegment[] | null;
} {
  if (!raw) return { text: "", segments: null };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.segments)) {
      return { text: parsed.text || "", segments: parsed.segments };
    }
  } catch {
    // Not JSON — legacy plain text
  }
  return { text: raw, segments: null };
}

/** Generate transcription for an audio file (MP3, WAV, FLAC, OGG supported) */
export async function generateTranscription(
  audioPath: string,
  options?: { language?: string; translate?: boolean; model?: string; threads?: number; vad?: boolean; vadModel?: string; onProgress?: (pct: number) => void; signal?: AbortSignal }
): Promise<TranscriptionResult> {
  // Read language from config if not explicitly provided
  if (!options?.language) {
    const configLang = await getWhisperLanguage();
    options = { ...options, language: configLang };
  }
  // Read translate from config if not explicitly provided
  if (options?.translate === undefined) {
    const configTranslate = await getWhisperTranslate();
    options = { ...options, translate: configTranslate };
  }
  // Read threads from config if not explicitly provided
  if (!options?.threads) {
    const configThreads = await getWhisperThreads();
    if (configThreads > 0) {
      options = { ...options, threads: configThreads };
    }
  }
  // Read VAD from config if not explicitly provided
  if (options?.vad === undefined) {
    const vadConfig = await getWhisperVad();
    options = { ...options, vad: vadConfig.enabled, vadModel: vadConfig.model };
  }

  return runWhisper(audioPath, options);
}

// Serial queue — one transcription at a time to avoid CPU overload
type QueueItem = {
  filename: string;
  language?: string;
  fn: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
};

const _global = globalThis as unknown as {
  _transcriptionQueue?: QueueItem[];
  _transcriptionRunning?: boolean;
  _transcriptionProgress?: Map<string, number>;
  _transcriptionAbort?: Map<string, AbortController>;
  _transcriptionActive?: string | null;
  _transcriptionActiveLanguage?: string | null;
};
if (!_global._transcriptionQueue) _global._transcriptionQueue = [];
if (!_global._transcriptionRunning) _global._transcriptionRunning = false;
if (!_global._transcriptionProgress) _global._transcriptionProgress = new Map();
if (!_global._transcriptionAbort) _global._transcriptionAbort = new Map();
if (_global._transcriptionActive === undefined) _global._transcriptionActive = null;
if (_global._transcriptionActiveLanguage === undefined) _global._transcriptionActiveLanguage = null;

async function processQueue(): Promise<void> {
  if (_global._transcriptionRunning) return;
  _global._transcriptionRunning = true;

  while (_global._transcriptionQueue!.length > 0) {
    const item = _global._transcriptionQueue!.shift()!;
    _global._transcriptionActive = item.filename;
    _global._transcriptionActiveLanguage = item.language || null;
    try {
      await item.fn();
      item.resolve();
    } catch (err) {
      item.reject(err);
    }
  }

  _global._transcriptionActive = null;
  _global._transcriptionActiveLanguage = null;
  _global._transcriptionRunning = false;
}

/** Get transcription progress (0–100) for a filename, or null if not actively transcribing */
export function getTranscriptionProgress(filename: string): number | null {
  return _global._transcriptionProgress!.get(filename) ?? null;
}

/** Set transcription progress for a filename */
export function setTranscriptionProgress(filename: string, progress: number): void {
  _global._transcriptionProgress!.set(filename, progress);
}

/** Clear transcription progress for a filename */
export function clearTranscriptionProgress(filename: string): void {
  _global._transcriptionProgress!.delete(filename);
}

/** Create an AbortController for a transcription job and return its signal */
export function createTranscriptionAbort(filename: string): AbortSignal {
  // Cancel any existing controller for this file
  _global._transcriptionAbort!.get(filename)?.abort();
  const controller = new AbortController();
  _global._transcriptionAbort!.set(filename, controller);
  return controller.signal;
}

/** Cancel an active or queued transcription for a filename. Returns true if something was cancelled. */
export function cancelTranscription(filename: string): boolean {
  // Abort active whisper process
  const controller = _global._transcriptionAbort!.get(filename);
  if (controller) {
    controller.abort();
    _global._transcriptionAbort!.delete(filename);
  }
  clearTranscriptionProgress(filename);
  return !!controller;
}

/** Enqueue a transcription job. Returns a promise that resolves when the job completes. */
export function enqueueTranscription(filename: string, fn: () => Promise<void>, language?: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    _global._transcriptionQueue!.push({ filename, language, fn, resolve, reject });
    processQueue();
  });
}

/** Get the current transcription queue status */
export function getTranscriptionQueueStatus(): {
  active: { filename: string; progress: number | null; language?: string | null } | null;
  pending: { filename: string; language?: string }[];
} {
  const active = _global._transcriptionActive
    ? { filename: _global._transcriptionActive, progress: getTranscriptionProgress(_global._transcriptionActive), language: _global._transcriptionActiveLanguage }
    : null;
  const pending = _global._transcriptionQueue!.map((item) => ({ filename: item.filename, language: item.language }));
  return { active, pending };
}
