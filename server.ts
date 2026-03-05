import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { WebSocketServer } from "ws";
import { handleTalkbackSocket, isTalkbackActive, onTalkbackStart } from "./src/lib/talkback.js";
import { setTalkbackActiveCheck, stopPlayback } from "./src/lib/server-playback.js";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, port });
const handle = app.getRequestHandler();

// Wire talkback ↔ server-playback mutual exclusion
setTalkbackActiveCheck(isTalkbackActive);
onTalkbackStart(() => stopPlayback());

app.prepare().then(() => {
  const upgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url!, true);
    if (pathname === "/ws/talkback") {
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
