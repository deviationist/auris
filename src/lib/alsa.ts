import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

export interface CaptureDevice {
  card: number;
  device: number;
  name: string;
  cardName: string;
  alsaId: string;
}

export interface MixerVolume {
  name: string;
  min: number;
  max: number;
  value: number;
  percent: number;
  dB: string;
  enabled: boolean;
}

export interface MixerEnum {
  name: string;
  items: string[];
  current: string;
}

function validateCard(card: number): void {
  if (!Number.isInteger(card) || card < 0 || card > 31) {
    throw new Error(`Invalid ALSA card number: ${card}`);
  }
}

function validateVolume(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 65536) {
    throw new Error(`Invalid volume value: ${value}`);
  }
}

export async function listCaptureDevices(): Promise<CaptureDevice[]> {
  try {
    const { stdout } = await execFile("sudo", ["arecord", "-l"]);
    const regex =
      /^card (\d+): (\S+) \[(.+?)\], device (\d+): (.+?) \[/gm;
    const devices: CaptureDevice[] = [];
    let match;
    while ((match = regex.exec(stdout)) !== null) {
      devices.push({
        card: parseInt(match[1]),
        device: parseInt(match[4]),
        name: match[5],
        cardName: match[3],
        alsaId: `plughw:CARD=${match[2]},DEV=${match[4]}`,
      });
    }
    return devices;
  } catch {
    return [];
  }
}

export interface PlaybackDevice {
  card: number;
  device: number;
  name: string;
  cardName: string;
  alsaId: string;
}

export async function listPlaybackDevices(): Promise<PlaybackDevice[]> {
  try {
    const { stdout } = await execFile("sudo", ["aplay", "-l"]);
    const regex =
      /^card (\d+): (\S+) \[(.+?)\], device (\d+): (.+?) \[/gm;
    const devices: PlaybackDevice[] = [];
    let match;
    while ((match = regex.exec(stdout)) !== null) {
      devices.push({
        card: parseInt(match[1]),
        device: parseInt(match[4]),
        name: match[5],
        cardName: match[3],
        alsaId: `plughw:CARD=${match[2]},DEV=${match[4]}`,
      });
    }
    return devices;
  } catch {
    return [];
  }
}

export async function getCaptureVolume(
  card: number = 0
): Promise<MixerVolume | null> {
  validateCard(card);
  try {
    const { stdout } = await execFile("sudo", [
      "amixer", "-c", String(card), "sget", "Capture",
    ]);
    return parseVolume("Capture", stdout);
  } catch {
    return null;
  }
}

export async function getMicBoost(
  card: number = 0
): Promise<MixerVolume | null> {
  validateCard(card);
  try {
    const { stdout } = await execFile("sudo", [
      "amixer", "-c", String(card), "sget", "Mic Boost",
    ]);
    return parseVolume("Mic Boost", stdout);
  } catch {
    return null;
  }
}

export async function getInputSource(
  card: number = 0
): Promise<MixerEnum | null> {
  validateCard(card);
  try {
    const { stdout } = await execFile("sudo", [
      "amixer", "-c", String(card), "sget", "Input Source",
    ]);
    const itemsMatch = stdout.match(/Items:\s*(.+)/);
    const currentMatch = stdout.match(/Item0:\s*'(.+?)'/);
    if (!itemsMatch) return null;
    const items = [...itemsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    return {
      name: "Input Source",
      items,
      current: currentMatch ? currentMatch[1] : items[0],
    };
  } catch {
    return null;
  }
}

export async function getPlaybackVolume(
  card: number = 0
): Promise<MixerVolume | null> {
  validateCard(card);
  // Try common playback control names
  for (const name of ["PCM Playback Volume", "PCM", "Speaker", "Headphone"]) {
    try {
      const { stdout } = await execFile("sudo", [
        "amixer", "-c", String(card), "sget", name,
      ]);
      const result = parseVolume(name, stdout);
      if (result) return result;
    } catch {
      // control doesn't exist, try next
    }
  }
  return null;
}

export async function setPlaybackVolume(
  value: number,
  card: number = 0
): Promise<void> {
  validateCard(card);
  validateVolume(value);
  for (const name of ["PCM Playback Volume", "PCM", "Speaker", "Headphone"]) {
    try {
      await execFile("sudo", [
        "amixer", "-c", String(card), "sset", name, String(value),
      ]);
      return;
    } catch {
      // control doesn't exist, try next
    }
  }
  throw new Error("No playback volume control found");
}

export async function setCaptureVolume(
  value: number,
  card: number = 0
): Promise<void> {
  validateCard(card);
  validateVolume(value);
  await execFile("sudo", [
    "amixer", "-c", String(card), "sset", "Capture", String(value),
  ]);
}

export async function setMicBoost(
  value: number,
  card: number = 0
): Promise<void> {
  validateCard(card);
  validateVolume(value);
  await execFile("sudo", [
    "amixer", "-c", String(card), "sset", "Mic Boost", String(value),
  ]);
}

export async function setInputSource(
  source: string,
  card: number = 0
): Promise<void> {
  validateCard(card);
  // Validate source contains only safe characters (alphanumeric, spaces, hyphens)
  if (!/^[a-zA-Z0-9 \-]+$/.test(source)) {
    throw new Error(`Invalid input source name: ${source}`);
  }
  await execFile("sudo", [
    "amixer", "-c", String(card), "sset", "Input Source", source,
  ]);
}

function parseVolume(name: string, stdout: string): MixerVolume | null {
  const limMatch = stdout.match(/Limits:.*?(\d+) - (\d+)/);
  // Match capture or playback volume lines (Front Left or Mono channel)
  const valMatch = stdout.match(
    /(?:Front Left|Mono):.*?(\d+) \[(\d+)%\] \[(.+?dB)\](?:\s*\[(on|off)\])?/
  );
  if (!limMatch || !valMatch) return null;
  return {
    name,
    min: parseInt(limMatch[1]),
    max: parseInt(limMatch[2]),
    value: parseInt(valMatch[1]),
    percent: parseInt(valMatch[2]),
    dB: valMatch[3],
    enabled: valMatch[4] ? valMatch[4] === "on" : true,
  };
}
