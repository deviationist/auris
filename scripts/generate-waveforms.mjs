#!/usr/bin/env node

// Generate waveform cache files for recordings.
// Usage: node scripts/generate-waveforms.mjs [--force]
// --force: Regenerate all waveforms, even if cached

import { readdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

const force = process.argv.includes("--force");
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";
const SAMPLE_RATE = 8000;
const PEAKS_PER_SECOND = 50;
const MIN_PEAKS = 200;
const MAX_PEAKS = 2000;

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
  return peaks.map((p) => +(p / maxPeak).toFixed(3));
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

  const mp3s = files.filter((f) => f.endsWith(".mp3"));
  let generated = 0;
  let skipped = 0;

  for (const mp3 of mp3s) {
    const cachePath = join(RECORDINGS_DIR, `${mp3}.waveform.json`);
    if (!force) {
      try {
        await access(cachePath);
        skipped++;
        continue;
      } catch {
        // No cache file — generate it
      }
    }

    const mp3Path = join(RECORDINGS_DIR, mp3);
    try {
      const pcm = await extractPCM(mp3Path);
      const durationSecs = pcm.length / 2 / SAMPLE_RATE;
      const numBars = Math.min(MAX_PEAKS, Math.max(MIN_PEAKS, Math.round(durationSecs * PEAKS_PER_SECOND)));
      const peaks = computePeaks(pcm, numBars);
      await writeFile(cachePath, JSON.stringify(peaks), "utf-8");
      generated++;
      console.log(`Generated: ${mp3} (${numBars} peaks)`);
    } catch (err) {
      console.error(`Failed: ${mp3} — ${err.message}`);
    }
  }

  console.log(`\nDone. Generated: ${generated}, Skipped (already cached): ${skipped}`);
}

main();
