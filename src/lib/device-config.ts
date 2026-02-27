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

export async function getSelectedDevice(): Promise<string> {
  const config = await readConfig();
  return config.ALSA_DEVICE || "plughw:0,0";
}

export async function setSelectedDevice(alsaId: string): Promise<void> {
  const config = await readConfig();
  config.ALSA_DEVICE = alsaId;
  await writeConfig(config);
}

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
