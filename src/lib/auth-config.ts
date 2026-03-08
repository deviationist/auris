import { readFile } from "fs/promises";

const CONFIG_PATH = "/etc/default/auris";

async function readConfig(): Promise<Record<string, string>> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    const config: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w+)=(.*)$/);
      if (match) config[match[1]] = match[2].replace(/^'(.*)'$/, "$1");
    }
    return config;
  } catch {
    return {};
  }
}

export async function getAuthCredentials(): Promise<{
  username: string;
  passwordHash: string;
} | null> {
  const config = await readConfig();
  const username = config.AUTH_USERNAME;
  const passwordHash = config.AUTH_PASSWORD_HASH;
  if (!username || !passwordHash) return null;
  return { username, passwordHash };
}

let _authEnabled: boolean | null = null;

export async function isAuthEnabled(): Promise<boolean> {
  if (_authEnabled === null) {
    if (process.env.AUTH_ACTIVE === "false") {
      _authEnabled = false;
    } else {
      _authEnabled = (await getAuthCredentials()) !== null;
    }
  }
  return _authEnabled;
}
