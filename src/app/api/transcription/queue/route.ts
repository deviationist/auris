import { NextResponse } from "next/server";
import { getTranscriptionQueueStatus } from "@/lib/transcription";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export async function GET() {
  const status = getTranscriptionQueueStatus();

  // Look up display names for all filenames in the queue
  const allFilenames = [
    ...(status.active ? [status.active.filename] : []),
    ...status.pending.map((p) => p.filename),
  ];

  const nameMap: Record<string, string> = {};
  if (allFilenames.length > 0) {
    const db = getDb();
    const rows = db
      .select({ filename: recordings.filename, name: recordings.name })
      .from(recordings)
      .where(inArray(recordings.filename, allFilenames))
      .all();
    for (const row of rows) {
      if (row.name) nameMap[row.filename] = row.name;
    }
  }

  return NextResponse.json({ ...status, names: nameMap });
}
