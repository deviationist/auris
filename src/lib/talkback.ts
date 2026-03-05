import { spawn, type ChildProcess } from "child_process";
import type { WebSocket } from "ws";
import type { ParsedUrlQuery } from "querystring";
import { getPlaybackDevice } from "./device-config.js";
import { buildFilterChain, DEFAULT_EFFECTS, type TalkbackEffects } from "./talkback-effects.js";

let activeSession: { ws: WebSocket; ffmpeg: ChildProcess } | null = null;
let onTalkbackStartCallback: (() => void) | null = null;

export function isTalkbackActive(): boolean {
  return activeSession !== null;
}

export function onTalkbackStart(cb: () => void) {
  onTalkbackStartCallback = cb;
}

function parseEffects(query: ParsedUrlQuery): TalkbackEffects {
  try {
    const raw = typeof query.effects === "string" ? query.effects : "";
    if (!raw) return DEFAULT_EFFECTS;
    return { ...DEFAULT_EFFECTS, ...JSON.parse(raw) };
  } catch {
    console.log("[talkback] failed to parse effects, using defaults");
    return DEFAULT_EFFECTS;
  }
}

export function handleTalkbackSocket(ws: WebSocket, query: ParsedUrlQuery = {}) {
  if (activeSession) {
    console.log("[talkback] rejected — already in use");
    ws.close(4409, "Talkback already in use");
    return;
  }

  let ffmpeg: ChildProcess | null = null;
  let closed = false;
  let messageCount = 0;
  let bytesReceived = 0;

  function cleanup() {
    if (closed) return;
    closed = true;
    console.log(`[talkback] cleanup — received ${messageCount} messages, ${bytesReceived} bytes`);
    if (activeSession?.ws === ws) activeSession = null;
    if (ffmpeg) {
      ffmpeg.stdin?.end();
      ffmpeg.kill("SIGTERM");
      ffmpeg = null;
    }
  }

  getPlaybackDevice()
    .then((device) => {
      if (closed) return;

      // Talkback takes priority — notify listeners (e.g. server playback)
      onTalkbackStartCallback?.();

      const effects = parseEffects(query);
      const filters = buildFilterChain(effects);
      console.log(`[talkback] starting ffmpeg → ${device}${filters.length ? ` with filters: ${filters[1]}` : ""}`);

      ffmpeg = spawn("ffmpeg", [
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "1",
        "-i", "pipe:0",
        ...filters,
        "-f", "alsa",
        device,
      ], {
        stdio: ["pipe", "ignore", "pipe"],
      });

      ffmpeg.stderr?.on("data", (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) console.log(`[talkback:ffmpeg] ${line}`);
      });

      ffmpeg.on("error", (err) => {
        console.error(`[talkback] ffmpeg error: ${err.message}`);
        cleanup();
      });
      ffmpeg.on("exit", (code) => {
        console.log(`[talkback] ffmpeg exited with code ${code}`);
        cleanup();
      });

      activeSession = { ws, ffmpeg };

      ws.on("message", (data: Buffer) => {
        messageCount++;
        bytesReceived += data.length;
        if (messageCount === 1) {
          console.log(`[talkback] first message: ${data.length} bytes`);
        }
        if (ffmpeg?.stdin?.writable) {
          ffmpeg.stdin.write(data);
        }
      });

      ws.on("close", () => {
        console.log("[talkback] ws closed");
        cleanup();
      });
      ws.on("error", (err) => {
        console.error(`[talkback] ws error: ${err.message}`);
        cleanup();
      });
    })
    .catch((err) => {
      console.error(`[talkback] config error: ${err}`);
      ws.close(4500, "Failed to read playback device config");
    });
}
