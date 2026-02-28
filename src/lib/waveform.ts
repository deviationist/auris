import { spawn } from "child_process";
import { createHash } from "crypto";

const SAMPLE_RATE = 8000;
const NUM_PEAKS = 1600;

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

  // Use 99th percentile for normalization so occasional loud spikes
  // don't crush the rest of the waveform to near-zero
  const sorted = [...peaks].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || maxPeak;
  const ceiling = Math.max(p99, maxPeak * 0.1); // never less than 10% of max
  return peaks.map((p) => +Math.min(1, p / ceiling).toFixed(3));
}

export function hashWaveform(json: string): string {
  return createHash("sha256").update(json).digest("hex").slice(0, 8);
}

export async function generateWaveform(mp3Path: string): Promise<number[]> {
  const pcm = await extractPCM(mp3Path);
  return computePeaks(pcm, NUM_PEAKS);
}
