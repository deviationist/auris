import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import { join } from "path";
import { getDb, syncExistingRecordings } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await syncExistingRecordings();

    const db = getDb();
    const rows = await db
      .select()
      .from(recordings)
      .orderBy(desc(recordings.createdAt));

    const result = await Promise.all(
      rows.map(async (row) => {
        let size = row.size;
        if (size === null) {
          try {
            const s = await stat(join(RECORDINGS_DIR, row.filename));
            size = s.size;
          } catch {
            size = 0;
          }
        }
        return {
          filename: row.filename,
          size: size ?? 0,
          createdAt: row.createdAt.getTime(),
          duration: row.duration,
          device: row.device,
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list recordings", detail: String(error) },
      { status: 500 }
    );
  }
}
