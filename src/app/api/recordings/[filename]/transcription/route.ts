import { NextRequest, NextResponse } from "next/server";
import { basename, join } from "path";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateTranscription, enqueueTranscription } from "@/lib/transcription";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

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
    .select({
      transcription: recordings.transcription,
      language: recordings.transcriptionLang,
      status: recordings.transcriptionStatus,
    })
    .from(recordings)
    .where(eq(recordings.filename, safe))
    .get();

  if (!row) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({
    transcription: row.transcription,
    language: row.language,
    status: row.status,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safe = basename(filename);
  if (safe !== filename || !filename.endsWith(".mp3")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const db = getDb();
  const row = await db
    .select({ id: recordings.id, transcriptionStatus: recordings.transcriptionStatus })
    .from(recordings)
    .where(eq(recordings.filename, safe))
    .get();

  if (!row) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (row.transcriptionStatus === "processing") {
    return NextResponse.json({ error: "Transcription already in progress" }, { status: 409 });
  }

  // Parse optional language override
  let language: string | undefined;
  try {
    const body = await req.json();
    if (body.language) language = body.language;
  } catch {
    // No body or invalid JSON — use default
  }

  const filePath = join(RECORDINGS_DIR, safe);

  // Mark as pending and enqueue
  await db.update(recordings).set({ transcriptionStatus: "pending" }).where(eq(recordings.filename, safe));

  enqueueTranscription(async () => {
    await db.update(recordings).set({ transcriptionStatus: "processing" }).where(eq(recordings.filename, safe));
    const result = await generateTranscription(filePath, { language });
    await db.update(recordings).set({
      transcription: result.text,
      transcriptionLang: result.language,
      transcriptionStatus: "done",
    }).where(eq(recordings.filename, safe));
  }).catch(() => {
    db.update(recordings).set({ transcriptionStatus: "error" }).where(eq(recordings.filename, safe)).catch(() => {});
  });

  return NextResponse.json({ ok: true, status: "pending" });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safe = basename(filename);
  if (safe !== filename || !filename.endsWith(".mp3")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(recordings)
    .set({ transcription: null, transcriptionLang: null, transcriptionStatus: null })
    .where(eq(recordings.filename, safe));

  return NextResponse.json({ ok: true });
}
