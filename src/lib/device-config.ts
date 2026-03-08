import { readFile, writeFile } from "fs/promises";
import { spawn } from "child_process";

const CONFIG_PATH = "/etc/default/auris";

async function readConfig(): Promise<Record<string, string>> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    const config: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w+)=(.*)$/);
      if (match) config[match[1]] = match[2];
    }
    return config;
  } catch {
    return {};
  }
}

async function writeConfig(config: Record<string, string>): Promise<void> {
  const content = Object.entries(config)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";

  // Try direct write first, fall back to sudo tee
  try {
    await writeFile(CONFIG_PATH, content, "utf-8");
  } catch {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("sudo", ["tee", CONFIG_PATH], {
        stdio: ["pipe", "ignore", "pipe"],
      });
      proc.stdin.end(content);
      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`sudo tee failed (code ${code}): ${stderr}`));
      });
      proc.on("error", reject);
    });
  }
}

export async function getListenDevice(): Promise<string> {
  const config = await readConfig();
  return config.ALSA_DEVICE_LISTEN || config.ALSA_DEVICE || "default";
}

export async function setListenDevice(alsaId: string): Promise<void> {
  const config = await readConfig();
  config.ALSA_DEVICE_LISTEN = alsaId;
  config.ALSA_DEVICE = alsaId; // backward compat
  await writeConfig(config);
}

export async function getRecordDevice(): Promise<string> {
  const config = await readConfig();
  return config.ALSA_DEVICE_RECORD || config.ALSA_DEVICE || "default";
}

export async function setRecordDevice(alsaId: string): Promise<void> {
  const config = await readConfig();
  config.ALSA_DEVICE_RECORD = alsaId;
  await writeConfig(config);
}

export async function getStreamBitrate(): Promise<string> {
  const config = await readConfig();
  return config.STREAM_BITRATE || "128k";
}

export async function setStreamBitrate(bitrate: string): Promise<void> {
  const config = await readConfig();
  config.STREAM_BITRATE = bitrate;
  await writeConfig(config);
}

export async function getRecordBitrate(): Promise<string> {
  const config = await readConfig();
  return config.RECORD_BITRATE || "128k";
}

export async function setRecordBitrate(bitrate: string): Promise<void> {
  const config = await readConfig();
  config.RECORD_BITRATE = bitrate;
  await writeConfig(config);
}

export async function getPlaybackDevice(): Promise<string> {
  const config = await readConfig();
  return config.ALSA_DEVICE_PLAYBACK || "default";
}

export async function setPlaybackDevice(alsaId: string): Promise<void> {
  const config = await readConfig();
  config.ALSA_DEVICE_PLAYBACK = alsaId;
  await writeConfig(config);
}

// Aliases for backward compatibility
export const getSelectedDevice = getListenDevice;
export const setSelectedDevice = setListenDevice;

export async function getCaptureMode(): Promise<{
  stream: boolean;
  record: boolean;
}> {
  const config = await readConfig();
  return {
    stream: config.CAPTURE_STREAM === "1",
    record: config.CAPTURE_RECORD === "1",
  };
}

export async function setCaptureMode(mode: {
  stream?: boolean;
  record?: boolean;
}): Promise<void> {
  const config = await readConfig();
  if (mode.stream !== undefined)
    config.CAPTURE_STREAM = mode.stream ? "1" : "0";
  if (mode.record !== undefined)
    config.CAPTURE_RECORD = mode.record ? "1" : "0";
  await writeConfig(config);
}

export async function getRecordStartedAt(): Promise<number | null> {
  const config = await readConfig();
  const val = parseInt(config.RECORD_STARTED_AT, 10);
  return isNaN(val) ? null : val;
}

export async function setRecordStartedAt(ts: number | null): Promise<void> {
  const config = await readConfig();
  if (ts !== null) {
    config.RECORD_STARTED_AT = String(ts);
  } else {
    delete config.RECORD_STARTED_AT;
  }
  await writeConfig(config);
}

export async function getRecordChunkPart(): Promise<number> {
  const config = await readConfig();
  const val = parseInt(config.RECORD_CHUNK_PART, 10);
  return isNaN(val) ? 0 : val;
}

export async function setRecordChunkPart(part: number | null): Promise<void> {
  const config = await readConfig();
  if (part !== null && part > 0) {
    config.RECORD_CHUNK_PART = String(part);
  } else {
    delete config.RECORD_CHUNK_PART;
  }
  await writeConfig(config);
}

export async function getRecordChunkMinutes(): Promise<number> {
  const config = await readConfig();
  const val = parseInt(config.RECORD_CHUNK_MINUTES, 10);
  return isNaN(val) ? 0 : val;
}

export async function setRecordChunkMinutes(minutes: number): Promise<void> {
  const config = await readConfig();
  if (minutes > 0) {
    config.RECORD_CHUNK_MINUTES = String(minutes);
  } else {
    delete config.RECORD_CHUNK_MINUTES;
  }
  await writeConfig(config);
}

export async function getIcecastSourcePassword(): Promise<string> {
  const config = await readConfig();
  return config.ICECAST_SOURCE_PASSWORD || "sourcepass";
}

export async function getClientRecordMaxMinutes(): Promise<number> {
  const config = await readConfig();
  const val = parseInt(config.CLIENT_RECORD_MAX_MINUTES, 10);
  return isNaN(val) || val <= 0 ? 30 : val;
}
