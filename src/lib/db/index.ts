import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import * as schema from "./schema";
import { recordings } from "./schema";

const execFileAsync = promisify(execFile);
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";
const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), "data", "auris.db");

type Db = ReturnType<typeof drizzle<typeof schema>>;
let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("busy_timeout = 5000");
    _db = drizzle(sqlite, { schema });
    migrate(_db, { migrationsFolder: join(process.cwd(), "drizzle") });
  }
  return _db;
}

let _synced = false;

async function getDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ]);
    const secs = parseFloat(stdout.trim());
    return isNaN(secs) ? null : secs;
  } catch {
    return null;
  }
}

export async function syncExistingRecordings(): Promise<void> {
  if (_synced) return;
  _synced = true;

  const db = getDb();

  try {
    const files = await readdir(RECORDINGS_DIR);
    const mp3Files = files.filter((f) => f.endsWith(".mp3"));

    const existing = await db
      .select({ filename: recordings.filename })
      .from(recordings);
    const existingSet = new Set(existing.map((r) => r.filename));

    const missing = mp3Files.filter((f) => !existingSet.has(f));

    for (const filename of missing) {
      const filePath = join(RECORDINGS_DIR, filename);
      try {
        const s = await stat(filePath);
        const duration = await getDuration(filePath);
        await db
          .insert(recordings)
          .values({
            filename,
            size: s.size,
            duration,
            device: null,
            createdAt: new Date(s.birthtimeMs || s.mtimeMs),
          })
          .onConflictDoNothing();
      } catch {
        // skip files we can't stat
      }
    }
  } catch {
    // recordings dir might not exist yet
  }
}
