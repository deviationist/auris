#!/usr/bin/env node
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { createInterface } from "readline";
import bcrypt from "bcryptjs";

const CONFIG_PATH = "/etc/default/auris";

// Queue-based readline that doesn't drop buffered lines between awaits
function createPrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lineQueue = [];
  let lineWaiter = null;

  rl.on("line", (line) => {
    if (lineWaiter) {
      const resolve = lineWaiter;
      lineWaiter = null;
      resolve(line);
    } else {
      lineQueue.push(line);
    }
  });

  rl.on("close", () => {
    if (lineWaiter) {
      lineWaiter("");
      lineWaiter = null;
    }
  });

  function ask(query) {
    process.stdout.write(query);
    if (lineQueue.length > 0) {
      return Promise.resolve(lineQueue.shift());
    }
    return new Promise((resolve) => {
      lineWaiter = resolve;
    });
  }

  return { ask, close: () => rl.close() };
}

function updateConfig(config, updates) {
  let lines = config
    .split("\n")
    .filter((l) => !Object.keys(updates).some((k) => l.startsWith(`${k}=`)));
  for (const [k, v] of Object.entries(updates)) {
    if (v !== null) lines.push(`${k}=${v}`);
  }
  return lines.filter((l) => l.trim() !== "").join("\n") + "\n";
}

function writeConfig(newConfig) {
  execSync(
    `printf '%s' '${newConfig.replace(/'/g, "'\\''")}' | sudo tee ${CONFIG_PATH} > /dev/null`
  );
}

async function main() {
  let config = "";
  try {
    config = readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    console.error(`Cannot read ${CONFIG_PATH}. Run npm run setup first.`);
    process.exit(1);
  }

  const currentUser = config.match(/^AUTH_USERNAME=(.*)$/m)?.[1];
  const defaultUser = currentUser || "admin";

  const { ask, close } = createPrompter();

  try {
    const username =
      (await ask(`Username [${defaultUser}]: `)) || defaultUser;
    const password = await ask("Password (empty = disable auth): ");

    if (!password) {
      writeConfig(
        updateConfig(config, { AUTH_USERNAME: null, AUTH_PASSWORD_HASH: null })
      );
      console.log(
        "Auth disabled. Restart the app for changes to take effect."
      );
      return;
    }

    const confirm = await ask("Confirm password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    writeConfig(
      updateConfig(config, { AUTH_USERNAME: username, AUTH_PASSWORD_HASH: `'${hash}'` })
    );
    console.log(
      `Auth set for "${username}". Restart the app for changes to take effect.`
    );
  } finally {
    close();
  }
}

main();
