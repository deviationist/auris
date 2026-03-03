import { readFile } from "fs/promises";
import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);
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
    .join("\n");
  await exec(`echo '${content}' | sudo tee ${CONFIG_PATH} > /dev/null`);
}

export async function getListenDevice(): Promise<string> {
  const config = await readConfig();
  return config.ALSA_DEVICE_LISTEN || config.ALSA_DEVICE || "plughw:0,0";
}

export async function setListenDevice(alsaId: string): Promise<void> {
  const config = await readConfig();
  config.ALSA_DEVICE_LISTEN = alsaId;
  config.ALSA_DEVICE = alsaId; // backward compat
  await writeConfig(config);
}

export async function getRecordDevice(): Promise<string> {
  const config = await readConfig();
  return config.ALSA_DEVICE_RECORD || config.ALSA_DEVICE || "plughw:0,0";
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
