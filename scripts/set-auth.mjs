#!/usr/bin/env node
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { createInterface } from "readline";
import bcrypt from "bcryptjs";

const CONFIG_PATH = "/etc/default/auris";

function ask(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function askSecret(query) {
  if (!process.stdin.isTTY) {
    return ask(query);
  }
  return new Promise((resolve) => {
    process.stdout.write(query);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let input = "";
    const onData = (ch) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (ch === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(1);
      } else if (ch === "\u007f" || ch === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
      } else {
        input += ch;
      }
    };
    process.stdin.on("data", onData);
  });
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

  const username =
    (await ask(`Username [${defaultUser}]: `)) || defaultUser;
  const password = await askSecret("Password (empty = disable auth): ");

  if (!password) {
    writeConfig(
      updateConfig(config, { AUTH_USERNAME: null, AUTH_PASSWORD_HASH: null })
    );
    console.log(
      "Auth disabled. Restart the app for changes to take effect."
    );
    process.exit(0);
  }

  const confirm = await askSecret("Confirm password: ");
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
  process.exit(0);
}

main();
