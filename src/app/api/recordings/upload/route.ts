import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { generateWaveform, hashWaveform } from "@/lib/waveform";
import { generateTranscription, enqueueTranscription, setTranscriptionProgress, clearTranscriptionProgress, createTranscriptionAbort } from "@/lib/transcription";
import { buildFilterChain, DEFAULT_EFFECTS, type TalkbackEffects } from "@/lib/talkback-effects";
import { getWhisperEnabled } from "@/lib/device-config";

const execFileAsync = promisify(execFile);
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function generateFilename(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    "-",
    pad(now.getMonth() + 1),
    "-",
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    "-",
    pad(now.getMinutes()),
    "-",
    pad(now.getSeconds()),
    ".mp3",
  ].join("");
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

function transcode(inputPath: string, outputPath: string, effects?: TalkbackEffects): Promise<void> {
  const filters = effects ? buildFilterChain(effects) : [];
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y",
      "-i", inputPath,
      ...filters,
      "-acodec", "libmp3lame",
      "-ab", "128k",
      "-ar", "44100",
      "-ac", "1",
      "-v", "quiet",
      outputPath,
    ]);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

export async function POST(req: NextRequest) {
  let tmpPath: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Parse voice effects (if any)
    let effects: TalkbackEffects | undefined;
    const effectsRaw = formData.get("effects") as string | null;
    if (effectsRaw) {
      try {
        effects = { ...DEFAULT_EFFECTS, ...JSON.parse(effectsRaw) };
      } catch {}
    }

    // Write uploaded blob to temp file
    const buf = Buffer.from(await file.arrayBuffer());
    tmpPath = join(tmpdir(), `auris-upload-${randomBytes(8).toString("hex")}.webm`);
    await writeFile(tmpPath, buf);

    // Transcode to MP3 (with effects if provided)
    const filename = generateFilename();
    const mp3Path = join(RECORDINGS_DIR, filename);
    await transcode(tmpPath, mp3Path, effects);

    // Get file info
    const { size } = await import("fs/promises").then((fs) => fs.stat(mp3Path));
    const duration = await getDuration(mp3Path);

    // Build metadata
    const meta: Record<string, unknown> = {};
    if (effects) {
      const activeEffects = Object.fromEntries(
        Object.entries(effects).filter(([, v]) => typeof v === "object" && v !== null && "enabled" in v && v.enabled)
      );
      if (Object.keys(activeEffects).length > 0) {
        meta.effects = activeEffects;
      }
    }

    // Insert into DB
    const db = getDb();
    await db
      .insert(recordings)
      .values({
        filename,
        size,
        duration,
        device: "Client",
        metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    // Fire-and-forget waveform generation
    generateWaveform(mp3Path)
      .then(async (peaks) => {
        const json = JSON.stringify(peaks);
        const hash = hashWaveform(json);
        const { eq } = await import("drizzle-orm");
        await db
          .update(recordings)
          .set({ waveform: json, waveformHash: hash })
          .where(eq(recordings.filename, filename));
      })
      .catch(() => {});
    // Fire-and-forget transcription (queued, serial)
    if (await getWhisperEnabled()) {
      setTranscriptionProgress(filename, 0);
      const signal = createTranscriptionAbort(filename);
      enqueueTranscription(filename, async () => {
        if (signal.aborted) throw new Error("Transcription cancelled");
        const { eq } = await import("drizzle-orm");
        await db.update(recordings).set({ transcriptionStatus: "processing" }).where(eq(recordings.filename, filename));
        const result = await generateTranscription(mp3Path, { onProgress: (pct) => setTranscriptionProgress(filename, pct), signal });
        const stored = result.segments.length > 0 ? JSON.stringify({ text: result.text, segments: result.segments }) : result.text;
        await db.update(recordings).set({ transcription: stored, transcriptionLang: result.language, transcriptionStatus: "done" }).where(eq(recordings.filename, filename));
        clearTranscriptionProgress(filename);
      }).catch(async () => {
        clearTranscriptionProgress(filename);
        if (!signal.aborted) {
          const { eq } = await import("drizzle-orm");
          await db.update(recordings).set({ transcriptionStatus: "error" }).where(eq(recordings.filename, filename)).catch(() => {});
        }
      });
    }

    return NextResponse.json({ ok: true, filename });
  } catch (error) {
    return NextResponse.json(
      { error: "Upload failed", detail: String(error) },
      { status: 500 },
    );
  } finally {
    if (tmpPath) {
      unlink(tmpPath).catch(() => {});
    }
  }
}
