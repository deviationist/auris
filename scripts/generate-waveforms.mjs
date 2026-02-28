#!/usr/bin/env node

// Generate waveform data for recordings and store in the database.
// Usage: node scripts/generate-waveforms.mjs [--force] [--clear]
// --force: Regenerate all waveforms, even if already in DB
// --clear: Remove all waveforms from DB without regenerating

import { readdir } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { createHash } from "crypto";
import Database from "better-sqlite3";

const force = process.argv.includes("--force");
const clear = process.argv.includes("--clear");
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";
const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), "data", "auris.db");
const SAMPLE_RATE = 8000;
const NUM_PEAKS = 1600;

function extractPCM(mp3Path) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", mp3Path,
      "-f", "s16le", "-ac", "1", "-ar", String(SAMPLE_RATE),
      "-v", "quiet", "pipe:1",
    ]);
    const chunks = [];
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.stderr.on("data", () => {});
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

function computePeaks(pcmBuffer, numBars) {
  const samples = new Int16Array(
    pcmBuffer.buffer, pcmBuffer.byteOffset, Math.floor(pcmBuffer.length / 2)
  );
  if (samples.length === 0) return new Array(numBars).fill(0);

  const samplesPerBar = Math.max(1, Math.floor(samples.length / numBars));
  const peaks = [];
  let maxPeak = 0;

  for (let i = 0; i < numBars; i++) {
    let peak = 0;
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, samples.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > peak) peak = abs;
    }
    peaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }

  if (maxPeak === 0) return peaks.map(() => 0);

  // Use 99th percentile for normalization so occasional loud spikes
  // don't crush the rest of the waveform to near-zero
  const sorted = [...peaks].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || maxPeak;
  const ceiling = Math.max(p99, maxPeak * 0.1); // never less than 10% of max
  return peaks.map((p) => +Math.min(1, p / ceiling).toFixed(3));
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
    const result = db.prepare("UPDATE recordings SET waveform = NULL, waveform_hash = NULL WHERE waveform IS NOT NULL").run();
    db.close();
    console.log(`Cleared ${result.changes} waveform(s) from DB.`);
    return;
  }

  const mp3s = files.filter((f) => f.endsWith(".mp3"));
  let generated = 0;
  let skipped = 0;

  const getWaveform = db.prepare("SELECT waveform FROM recordings WHERE filename = ?");
  const setWaveform = db.prepare("UPDATE recordings SET waveform = ?, waveform_hash = ? WHERE filename = ?");

  for (const mp3 of mp3s) {
    if (!force) {
      const row = getWaveform.get(mp3);
      if (row?.waveform) {
        skipped++;
        continue;
      }
    }

    const mp3Path = join(RECORDINGS_DIR, mp3);
    try {
      const pcm = await extractPCM(mp3Path);
      const peaks = computePeaks(pcm, NUM_PEAKS);
      const json = JSON.stringify(peaks);
      const hash = createHash("sha256").update(json).digest("hex").slice(0, 8);
      setWaveform.run(json, hash, mp3);
      generated++;
      console.log(`Generated: ${mp3} (${NUM_PEAKS} peaks)`);
    } catch (err) {
      console.error(`Failed: ${mp3} — ${err.message}`);
    }
  }

  db.close();
  console.log(`\nDone. Generated: ${generated}, Skipped (already in DB): ${skipped}`);
}

main();
