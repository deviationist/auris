import { spawn } from "child_process";
import { getWhisperLanguage } from "@/lib/device-config";

const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cpp";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "/opt/whisper.cpp/models/ggml-medium.bin";

interface TranscriptionResult {
  text: string;
  language: string;
}

/** Run whisper.cpp on an audio file and return transcription text + language */
function runWhisper(audioPath: string, options?: { language?: string; model?: string }): Promise<TranscriptionResult> {
  const model = options?.model || WHISPER_MODEL;
  const lang = options?.language || "auto";

  return new Promise((resolve, reject) => {
    const args = [
      "-m", model,
      "-f", audioPath,
      "--no-timestamps",
    ];
    if (lang !== "auto") {
      args.push("-l", lang);
    }

    const proc = spawn(WHISPER_BIN, args);
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString();
        reject(new Error(`whisper-cpp exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      const text = Buffer.concat(chunks).toString().trim();
      const stderr = Buffer.concat(stderrChunks).toString();

      // Extract detected language from stderr (whisper.cpp prints "auto-detected language: xx")
      let detectedLang = lang;
      const langMatch = stderr.match(/auto-detected language:\s*(\w+)/i);
      if (langMatch) detectedLang = langMatch[1];

      resolve({ text, language: detectedLang });
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

/** Generate transcription for an audio file (MP3, WAV, FLAC, OGG supported) */
export async function generateTranscription(
  audioPath: string,
  options?: { language?: string; model?: string }
): Promise<TranscriptionResult> {
  // Read language from config if not explicitly provided
  if (!options?.language) {
    const configLang = await getWhisperLanguage();
    options = { ...options, language: configLang };
  }

  return runWhisper(audioPath, options);
}

// Serial queue — one transcription at a time to avoid CPU overload
type QueueItem = {
  fn: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
};

const _global = globalThis as unknown as { _transcriptionQueue?: QueueItem[]; _transcriptionRunning?: boolean };
if (!_global._transcriptionQueue) _global._transcriptionQueue = [];
if (!_global._transcriptionRunning) _global._transcriptionRunning = false;

async function processQueue(): Promise<void> {
  if (_global._transcriptionRunning) return;
  _global._transcriptionRunning = true;

  while (_global._transcriptionQueue!.length > 0) {
    const item = _global._transcriptionQueue!.shift()!;
    try {
      await item.fn();
      item.resolve();
    } catch (err) {
      item.reject(err);
    }
  }

  _global._transcriptionRunning = false;
}

/** Enqueue a transcription job. Returns a promise that resolves when the job completes. */
export function enqueueTranscription(fn: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    _global._transcriptionQueue!.push({ fn, resolve, reject });
    processQueue();
  });
}
