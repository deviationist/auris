import { getCaptureMode, setCaptureMode } from "@/lib/device-config";
import { isActive, stopUnit } from "@/lib/systemctl";

const ICECAST_STATUS_URL = "http://localhost:8000/status-json.xsl";
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
const IDLE_GRACE_MS = 60_000; // Must be idle for 60 seconds before stopping

let idleSince: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

interface IcecastStatus {
  icestats: {
    source?: {
      listeners: number;
    } | Array<{
      listeners: number;
    }>;
  };
}

async function getListenerCount(): Promise<number> {
  try {
    const res = await fetch(ICECAST_STATUS_URL);
    if (!res.ok) return -1;
    const data: IcecastStatus = await res.json();
    const source = data.icestats?.source;
    if (!source) return 0;
    // source can be a single object or array of mounts
    if (Array.isArray(source)) {
      return source.reduce((sum, s) => sum + (s.listeners || 0), 0);
    }
    return source.listeners || 0;
  } catch {
    return -1; // Can't reach Icecast, don't act
  }
}

async function checkIdle() {
  try {
    const mode = await getCaptureMode();

    // Only check idle for listening, never interfere with recording
    if (!mode.stream || mode.record) {
      idleSince = null;
      return;
    }

    // Stream is flagged as active — check if anyone is actually listening
    const streamRunning = await isActive("auris-stream");
    if (!streamRunning) {
      // Stream flag is set but service isn't running — just clean up the flag
      await setCaptureMode({ stream: false });
      idleSince = null;
      return;
    }

    const listeners = await getListenerCount();
    if (listeners < 0) return; // Can't determine, skip

    if (listeners === 0) {
      if (idleSince === null) {
        idleSince = Date.now();
      } else if (Date.now() - idleSince >= IDLE_GRACE_MS) {
        // Idle for long enough — stop the stream
        console.log("[stream-idle] No listeners detected, auto-stopping stream");
        await setCaptureMode({ stream: false });
        await stopUnit("auris-stream");
        idleSince = null;
      }
    } else {
      idleSince = null;
    }
  } catch {
    // Don't let errors in idle check crash the server
  }
}

export function startIdleCheck() {
  if (timer) return;
  timer = setInterval(checkIdle, CHECK_INTERVAL_MS);
}

export function stopIdleCheck() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
