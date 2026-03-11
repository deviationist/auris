import { spawn, type ChildProcess } from "child_process";
import type { WebSocket } from "ws";
import { getListenDevice } from "@/lib/device-config";

// globalThis singleton to survive HMR and share state with API routes
const g = globalThis as typeof globalThis & {
  __monitorStream?: MonitorStream | null;
};

interface MonitorStream {
  ffmpeg: ChildProcess;
  clients: Set<WebSocket>;
  device: string;
}

function getStream(): MonitorStream | null {
  return g.__monitorStream ?? null;
}

function setStream(v: MonitorStream | null) {
  g.__monitorStream = v;
}

// PCM format: 16-bit signed LE, 48kHz, mono
// Bytes per second: 48000 * 2 = 96,000
// We send chunks every ~20ms = 1920 bytes (960 samples)
const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const CHUNK_SAMPLES = 960; // 20ms at 48kHz
const CHUNK_BYTES = CHUNK_SAMPLES * 2 * CHANNELS;

export function getMonitorClientCount(): number {
  return getStream()?.clients.size ?? 0;
}

export function isMonitorActive(): boolean {
  return getStream() !== null && getStream()!.clients.size > 0;
}

async function startFfmpeg(): Promise<MonitorStream> {
  const device = await getListenDevice();
  console.log(`[monitor] starting ffmpeg ALSA capture from ${device}`);

  const ffmpeg = spawn("ffmpeg", [
    "-fflags", "+nobuffer",
    "-use_wallclock_as_timestamps", "1",
    "-f", "alsa",
    "-i", device,
    "-f", "s16le",
    "-ar", String(SAMPLE_RATE),
    "-ac", String(CHANNELS),
    "-flush_packets", "1",
    "pipe:1",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stream: MonitorStream = { ffmpeg, clients: new Set(), device };

  // Buffer partial data to send fixed-size chunks
  let buffer = Buffer.alloc(0);

  ffmpeg.stdout!.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= CHUNK_BYTES) {
      const frame = buffer.subarray(0, CHUNK_BYTES);
      buffer = buffer.subarray(CHUNK_BYTES);

      // Broadcast to all connected clients
      for (const ws of stream.clients) {
        if (ws.readyState === 1) { // WebSocket.OPEN
          try {
            ws.send(frame);
          } catch {
            stream.clients.delete(ws);
          }
        }
      }
    }
  });

  ffmpeg.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line && !line.startsWith("size=")) {
      console.log(`[monitor:ffmpeg] ${line}`);
    }
  });

  ffmpeg.on("error", (err) => {
    console.error(`[monitor] ffmpeg error: ${err.message}`);
    cleanupStream();
  });

  ffmpeg.on("exit", (code) => {
    console.log(`[monitor] ffmpeg exited with code ${code}`);
    cleanupStream();
  });

  setStream(stream);
  return stream;
}

function cleanupStream() {
  const stream = getStream();
  if (!stream) return;
  setStream(null);

  // Close all client connections
  for (const ws of stream.clients) {
    try { ws.close(1001, "Stream ended"); } catch { /* ignore */ }
  }
  stream.clients.clear();

  // Kill ffmpeg if still running
  if (!stream.ffmpeg.killed) {
    stream.ffmpeg.kill("SIGKILL");
  }
}

export async function handleMonitorSocket(ws: WebSocket) {
  let stream = getStream();

  // Start ffmpeg if not running
  if (!stream) {
    try {
      stream = await startFfmpeg();
    } catch (err) {
      console.error(`[monitor] failed to start ffmpeg:`, err);
      ws.close(4500, "Failed to start audio capture");
      return;
    }
  }

  stream.clients.add(ws);
  console.log(`[monitor] client connected (${stream.clients.size} total)`);

  // Send initial config message so client knows the PCM format
  ws.send(JSON.stringify({
    type: "config",
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: 16,
    chunkSamples: CHUNK_SAMPLES,
  }));

  ws.on("close", () => {
    stream!.clients.delete(ws);
    console.log(`[monitor] client disconnected (${stream!.clients.size} remaining)`);

    // Stop ffmpeg when no clients remain
    if (stream!.clients.size === 0) {
      console.log("[monitor] no clients remaining, stopping ffmpeg");
      cleanupStream();
    }
  });

  ws.on("error", (err) => {
    console.error(`[monitor] ws error: ${err.message}`);
    stream!.clients.delete(ws);
    if (stream!.clients.size === 0) {
      cleanupStream();
    }
  });
}

export function stopMonitorStream() {
  cleanupStream();
}
