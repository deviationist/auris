import { createServer, type IncomingMessage } from "http";
import next from "next";
import { parse } from "url";
import { WebSocketServer } from "ws";
import type { Duplex } from "stream";
import { handleTalkbackSocket, isTalkbackActive, onTalkbackStart } from "./src/lib/talkback.js";
import { handleMonitorSocket } from "./src/lib/monitor-stream.js";
import { setTalkbackActiveCheck, stopPlayback } from "./src/lib/server-playback.js";
import { isAuthEnabled } from "./src/lib/auth-config.js";
// VOX engine import — ensures globalThis singleton is initialized for API routes
import "./src/lib/vox.js";
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
  // Auth.js v5 uses "__Secure-authjs.session-token" on HTTPS, "authjs.session-token" on HTTP
  const secureName = "__Secure-authjs.session-token";
  const plainName = "authjs.session-token";

  const secureMatch = cookie.match(new RegExp(`(?:^|;\\s*)${secureName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`));
  const plainMatch = cookie.match(/(?:^|;\s*)authjs\.session-token=([^;]+)/);
  const match = secureMatch || plainMatch;
  if (!match) return false;

  const salt = secureMatch ? secureName : plainName;

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return false;
    const token = await decode({ token: match[1], secret, salt });
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
    } else if (pathname === "/ws/monitor") {
      if (!(await isWsAuthenticated(req))) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleMonitorSocket(ws);
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
