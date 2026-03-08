import { createServer, type IncomingMessage } from "http";
import next from "next";
import { parse } from "url";
import { WebSocketServer } from "ws";
import type { Duplex } from "stream";
import { handleTalkbackSocket, isTalkbackActive, onTalkbackStart } from "./src/lib/talkback.js";
import { setTalkbackActiveCheck, stopPlayback } from "./src/lib/server-playback.js";
import { isAuthEnabled } from "./src/lib/auth-config.js";
import { decode } from "next-auth/jwt";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, port });
const handle = app.getRequestHandler();

// Wire talkback ↔ server-playback mutual exclusion
setTalkbackActiveCheck(isTalkbackActive);
onTalkbackStart(() => stopPlayback());

async function isWsAuthenticated(req: IncomingMessage): Promise<boolean> {
  if (!(await isAuthEnabled())) return true;

  const cookie = req.headers.cookie || "";
  // Auth.js uses "authjs.session-token" in v5
  const match = cookie.match(/(?:^|;\s*)authjs\.session-token=([^;]+)/);
  if (!match) return false;

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return false;
    const token = await decode({ token: match[1], secret, salt: "authjs.session-token" });
    return token !== null;
  } catch {
    return false;
  }
}

app.prepare().then(() => {
  const upgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname, query } = parse(req.url!, true);
    if (pathname === "/ws/talkback") {
      if (!(await isWsAuthenticated(req))) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleTalkbackSocket(ws, query);
      });
    } else {
      // Let Next.js handle other WebSocket upgrades (HMR etc)
      upgrade(req, socket, head);
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
