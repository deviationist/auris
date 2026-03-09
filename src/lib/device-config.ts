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

export async function getWhisperLanguage(): Promise<string> {
  const config = await readConfig();
  return config.WHISPER_LANGUAGE || "auto";
}

export async function setWhisperLanguage(lang: string): Promise<void> {
  const config = await readConfig();
  config.WHISPER_LANGUAGE = lang;
  await writeConfig(config);
}

// --- Compressor config ---

export interface CompressorConfig {
  enabled: boolean;
  threshold: number;
  ratio: number;
  makeup: number;
  attack: number;
  release: number;
}

export async function getCompressorConfig(): Promise<CompressorConfig> {
  const config = await readConfig();
  return {
    enabled: config.COMPRESSOR_ENABLED === "1",
    threshold: parseFloat(config.COMPRESSOR_THRESHOLD) || -20,
    ratio: parseFloat(config.COMPRESSOR_RATIO) || 4,
    makeup: parseFloat(config.COMPRESSOR_MAKEUP) || 6,
    attack: parseInt(config.COMPRESSOR_ATTACK, 10) || 20,
    release: parseInt(config.COMPRESSOR_RELEASE, 10) || 250,
  };
}

export async function setCompressorConfig(c: Partial<CompressorConfig>): Promise<void> {
  const config = await readConfig();
  if (c.enabled !== undefined) config.COMPRESSOR_ENABLED = c.enabled ? "1" : "0";
  if (c.threshold !== undefined) config.COMPRESSOR_THRESHOLD = String(c.threshold);
  if (c.ratio !== undefined) config.COMPRESSOR_RATIO = String(c.ratio);
  if (c.makeup !== undefined) config.COMPRESSOR_MAKEUP = String(c.makeup);
  if (c.attack !== undefined) config.COMPRESSOR_ATTACK = String(c.attack);
  if (c.release !== undefined) config.COMPRESSOR_RELEASE = String(c.release);
  await writeConfig(config);
}

// --- VOX config ---

export interface VoxConfig {
  threshold: number;      // dB, default -30
  triggerMs: number;       // ms level must exceed threshold before recording, default 500
  preBufferSecs: number;   // seconds of pre-trigger audio to keep, default 5
  postSilenceSecs: number; // seconds of silence before stopping, default 10
}

export async function getVoxConfig(): Promise<VoxConfig> {
  const config = await readConfig();
  return {
    threshold: parseFloat(config.VOX_THRESHOLD) || -30,
    triggerMs: parseInt(config.VOX_TRIGGER_MS, 10) || 500,
    preBufferSecs: parseInt(config.VOX_PRE_BUFFER_SECS, 10) || 5,
    postSilenceSecs: parseInt(config.VOX_POST_SILENCE_SECS, 10) || 10,
  };
}

export async function setVoxConfig(vox: Partial<VoxConfig>): Promise<void> {
  const config = await readConfig();
  if (vox.threshold !== undefined) config.VOX_THRESHOLD = String(vox.threshold);
  if (vox.triggerMs !== undefined) config.VOX_TRIGGER_MS = String(vox.triggerMs);
  if (vox.preBufferSecs !== undefined) config.VOX_PRE_BUFFER_SECS = String(vox.preBufferSecs);
  if (vox.postSilenceSecs !== undefined) config.VOX_POST_SILENCE_SECS = String(vox.postSilenceSecs);
  await writeConfig(config);
}
