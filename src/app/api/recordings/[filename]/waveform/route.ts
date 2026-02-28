import { NextRequest, NextResponse } from "next/server";
import { basename } from "path";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  const safe = basename(filename);
  if (safe !== filename || !filename.endsWith(".mp3")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const db = getDb();

  const row = await db
    .select({ waveform: recordings.waveform })
    .from(recordings)
    .where(eq(recordings.filename, safe))
    .get();

  if (row?.waveform) {
    return new Response(row.waveform, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  return NextResponse.json({ error: "No waveform" }, { status: 404 });
}
