#!/usr/bin/env node

// Generate transcriptions for recordings using whisper.cpp.
// Usage: node scripts/generate-transcriptions.mjs [--force] [--clear] [--language <code>] [--model <path>]
// --force: Re-transcribe all recordings, even if already done
// --clear: Remove all transcriptions from DB
// --language <code>: Override language (default: auto)
// --model <path>: Override whisper model path

import { readdir } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import Database from "better-sqlite3";

const force = process.argv.includes("--force");
const clear = process.argv.includes("--clear");
const langIdx = process.argv.indexOf("--language");
const modelIdx = process.argv.indexOf("--model");
const language = langIdx !== -1 ? process.argv[langIdx + 1] : (process.env.WHISPER_LANGUAGE || "auto");
const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : (process.env.WHISPER_MODEL || "/opt/whisper.cpp/models/ggml-medium.bin");
const whisperBin = process.env.WHISPER_BIN || "whisper-cpp";
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";
const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), "data", "auris.db");

function parseTimestamp(ts) {
  const parts = ts.split(":");
  return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
}

function parseTimestampedOutput(output) {
  const segments = [];
  const textParts = [];
  const lineRegex = /^\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)$/;

  for (const line of output.split("\n")) {
    const match = line.match(lineRegex);
    if (match) {
      const segText = match[3].trim();
      segments.push({ start: parseTimestamp(match[1]), end: parseTimestamp(match[2]), text: segText });
      if (segText) textParts.push(segText);
    }
  }

  if (segments.length === 0) return { text: output, segments: [] };
  return { text: textParts.join(" "), segments };
}

function runWhisper(audioPath, lang, modelPath) {
  return new Promise((resolve, reject) => {
    const args = ["-m", modelPath, "-f", audioPath];
    if (lang !== "auto") args.push("-l", lang);

    const proc = spawn(whisperBin, args);
    const chunks = [];
    const stderrChunks = [];
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    proc.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString();
        reject(new Error(`whisper-cpp exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      const stdout = Buffer.concat(chunks).toString().trim();
      const stderr = Buffer.concat(stderrChunks).toString();
      let detectedLang = lang;
      const langMatch = stderr.match(/auto-detected language:\s*(\w+)/i);
      if (langMatch) detectedLang = langMatch[1];

      const { text, segments } = parseTimestampedOutput(stdout);
      const stored = segments.length > 0
        ? JSON.stringify({ text, segments })
        : text;
      resolve({ text: stored, language: detectedLang });
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error(`whisper-cpp not found at "${whisperBin}". Install whisper.cpp and ensure the binary is in PATH.`));
      } else {
        reject(err);
      }
    });
  });
}

async function main() {
  let files;
  try {
    files = await readdir(RECORDINGS_DIR);
  } catch (err) {
    console.error(`Cannot read directory: ${RECORDINGS_DIR}`);
    console.error(err.message);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  if (clear) {
    const result = db.prepare("UPDATE recordings SET transcription = NULL, transcription_lang = NULL, transcription_status = NULL WHERE transcription IS NOT NULL OR transcription_status IS NOT NULL").run();
    db.close();
    console.log(`Cleared ${result.changes} transcription(s) from DB.`);
    return;
  }

  const mp3s = files.filter((f) => f.endsWith(".mp3"));
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  const getStatus = db.prepare("SELECT transcription_status FROM recordings WHERE filename = ?");
  const setTranscription = db.prepare("UPDATE recordings SET transcription = ?, transcription_lang = ?, transcription_status = 'done' WHERE filename = ?");
  const setError = db.prepare("UPDATE recordings SET transcription_status = 'error' WHERE filename = ?");

  console.log(`Using model: ${model}`);
  console.log(`Language: ${language}`);
  console.log(`Processing ${mp3s.length} recording(s)...\n`);

  for (const mp3 of mp3s) {
    if (!force) {
      const row = getStatus.get(mp3);
      if (row?.transcription_status === "done") {
        skipped++;
        continue;
      }
    }

    const mp3Path = join(RECORDINGS_DIR, mp3);

    try {
      const result = await runWhisper(mp3Path, language, model);
      setTranscription.run(result.text, result.language, mp3);
      generated++;
      const preview = result.text.length > 80 ? result.text.slice(0, 80) + "..." : result.text;
      console.log(`Transcribed: ${mp3} [${result.language}] "${preview}"`);
    } catch (err) {
      setError.run(mp3);
      failed++;
      console.error(`Failed: ${mp3} — ${err.message}`);
    }
  }

  db.close();
  console.log(`\nDone. Transcribed: ${generated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main();
