import { spawn, type ChildProcess } from "child_process";
import { getPlaybackDevice } from "@/lib/device-config";

interface ActivePlayback {
  ffmpeg: ChildProcess;
  filename: string;
  startedAt: number;
}

// Store singleton on globalThis to survive HMR module reloads in dev
const g = globalThis as typeof globalThis & {
  __serverPlaybackActive?: ActivePlayback | null;
  __talkbackActiveCheck?: (() => boolean) | null;
};

function getActive(): ActivePlayback | null {
  return g.__serverPlaybackActive ?? null;
}

function setActive(v: ActivePlayback | null) {
  g.__serverPlaybackActive = v;
}

export function getActivePlayback(): { filename: string; startedAt: number } | null {
  const active = getActive();
  if (!active) return null;
  return { filename: active.filename, startedAt: active.startedAt };
}

export async function stopPlayback(): Promise<void> {
  const active = getActive();
  if (!active) return;
  setActive(null);
  const { ffmpeg, filename } = active;
  console.log(`[server-playback] stopping ${filename}`);
  ffmpeg.kill("SIGTERM");
  // Wait for the process to exit so it releases the ALSA device
  await new Promise<void>((resolve) => {
    ffmpeg.on("exit", () => resolve());
    // Safety timeout in case the process doesn't exit
    setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      resolve();
    }, 2000);
  });
}

export function isTalkbackActive(): boolean {
  return g.__talkbackActiveCheck?.() ?? false;
}

export function setTalkbackActiveCheck(check: () => boolean): void {
  g.__talkbackActiveCheck = check;
}

export async function startPlayback(filePath: string, filename: string): Promise<void> {
  await stopPlayback();

  const device = await getPlaybackDevice();
  console.log(`[server-playback] playing ${filename} → ${device}`);

  const ffmpeg = spawn("ffmpeg", [
    "-re",
    "-i", filePath,
    "-f", "alsa",
    device,
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  const startedAt = Date.now();
  setActive({ ffmpeg, filename, startedAt });

  ffmpeg.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[server-playback:ffmpeg] ${line}`);
  });

  ffmpeg.on("error", (err) => {
    console.error(`[server-playback] ffmpeg error: ${err.message}`);
    if (getActive()?.ffmpeg === ffmpeg) setActive(null);
  });

  ffmpeg.on("exit", (code) => {
    console.log(`[server-playback] ffmpeg exited with code ${code}`);
    if (getActive()?.ffmpeg === ffmpeg) setActive(null);
  });
}
