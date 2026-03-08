import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

const ALLOWED_UNITS = new Set(["auris-stream", "auris-record"]);

function validateUnit(unit: string): void {
  if (!ALLOWED_UNITS.has(unit)) {
    throw new Error(`Invalid systemd unit: ${unit}`);
  }
}

export async function isActive(unit: string): Promise<boolean> {
  validateUnit(unit);
  try {
    const { stdout } = await execFile("sudo", ["systemctl", "is-active", unit]);
    return stdout.trim() === "active";
  } catch {
    return false;
  }
}

export async function startUnit(unit: string): Promise<void> {
  validateUnit(unit);
  await execFile("sudo", ["systemctl", "start", unit]);
}

export async function stopUnit(unit: string): Promise<void> {
  validateUnit(unit);
  await execFile("sudo", ["systemctl", "stop", unit]);
}

export async function restartUnit(unit: string): Promise<void> {
  validateUnit(unit);
  await execFile("sudo", ["systemctl", "restart", unit]);
}
