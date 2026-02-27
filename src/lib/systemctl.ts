import { exec as execCb } from "child_process";
import { promisify } from "util";

const exec = promisify(execCb);

export async function isActive(unit: string): Promise<boolean> {
  try {
    const { stdout } = await exec(`sudo systemctl is-active ${unit}`);
    return stdout.trim() === "active";
  } catch {
    return false;
  }
}

export async function startUnit(unit: string): Promise<void> {
  await exec(`sudo systemctl start ${unit}`);
}

export async function stopUnit(unit: string): Promise<void> {
  await exec(`sudo systemctl stop ${unit}`);
}

export async function restartUnit(unit: string): Promise<void> {
  await exec(`sudo systemctl restart ${unit}`);
}
