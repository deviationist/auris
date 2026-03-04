import { spawn, type ChildProcess } from "child_process";
import type { WebSocket } from "ws";
import { getPlaybackDevice } from "./device-config.js";

let activeSession: { ws: WebSocket; ffmpeg: ChildProcess } | null = null;

export function handleTalkbackSocket(ws: WebSocket) {
  if (activeSession) {
    ws.close(4409, "Talkback already in use");
    return;
  }

  let ffmpeg: ChildProcess | null = null;
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
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

      ffmpeg = spawn("ffmpeg", [
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "1",
        "-i", "pipe:0",
        "-f", "alsa",
        device,
      ], {
        stdio: ["pipe", "ignore", "ignore"],
      });

      ffmpeg.on("error", cleanup);
      ffmpeg.on("exit", cleanup);

      activeSession = { ws, ffmpeg };

      ws.on("message", (data: Buffer) => {
        if (ffmpeg?.stdin?.writable) {
          ffmpeg.stdin.write(data);
        }
      });

      ws.on("close", cleanup);
      ws.on("error", cleanup);
    })
    .catch(() => {
      ws.close(4500, "Failed to read playback device config");
    });
}
