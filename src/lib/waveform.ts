import { writeFile } from "fs/promises";
import { spawn } from "child_process";

const SAMPLE_RATE = 8000;
const PEAKS_PER_SECOND = 50;
const MIN_PEAKS = 200;
const MAX_PEAKS = 2000;

function extractPCM(mp3Path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", mp3Path,
      "-f", "s16le", "-ac", "1", "-ar", String(SAMPLE_RATE),
      "-v", "quiet", "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", () => {});
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

function computePeaks(pcmBuffer: Buffer, numBars: number): number[] {
  const samples = new Int16Array(
    pcmBuffer.buffer, pcmBuffer.byteOffset, Math.floor(pcmBuffer.length / 2)
  );
  if (samples.length === 0) return new Array(numBars).fill(0);

  const samplesPerBar = Math.max(1, Math.floor(samples.length / numBars));
  const peaks: number[] = [];
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

export async function generateWaveform(mp3Path: string, cachePath: string): Promise<number[]> {
  const pcm = await extractPCM(mp3Path);
  const durationSecs = pcm.length / 2 / SAMPLE_RATE;
  const numBars = Math.min(MAX_PEAKS, Math.max(MIN_PEAKS, Math.round(durationSecs * PEAKS_PER_SECOND)));
  const peaks = computePeaks(pcm, numBars);
  await writeFile(cachePath, JSON.stringify(peaks), "utf-8");
  return peaks;
}
