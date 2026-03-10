import { NextRequest, NextResponse } from "next/server";
import { basename, join } from "path";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateTranscription, enqueueTranscription, parseStoredTranscription, getTranscriptionProgress, setTranscriptionProgress, clearTranscriptionProgress, createTranscriptionAbort, cancelTranscription } from "@/lib/transcription";
import { getWhisperEnabled } from "@/lib/device-config";

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

  const { text, segments } = parseStoredTranscription(row.transcription);

  const progress = (row.status === "processing" || row.status === "pending")
    ? getTranscriptionProgress(safe)
    : null;

  return NextResponse.json({
    transcription: text,
    segments,
    language: row.language,
    status: row.status,
    progress,
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

  if (!(await getWhisperEnabled())) {
    return NextResponse.json({ error: "Transcription is disabled" }, { status: 403 });
  }

  if (row.transcriptionStatus === "processing") {
    return NextResponse.json({ error: "Transcription already in progress" }, { status: 409 });
  }

  // Parse optional language/translate overrides
  let language: string | undefined;
  let translate: boolean | undefined;
  try {
    const body = await req.json();
    if (body.language) language = body.language;
    if (body.translate !== undefined) translate = !!body.translate;
  } catch {
    // No body or invalid JSON — use default
  }

  const filePath = join(RECORDINGS_DIR, safe);

  // Mark as pending and enqueue
  await db.update(recordings).set({ transcriptionStatus: "pending" }).where(eq(recordings.filename, safe));

  setTranscriptionProgress(safe, 0);
  const signal = createTranscriptionAbort(safe);
  enqueueTranscription(safe, async () => {
    if (signal.aborted) throw new Error("Transcription cancelled");
    await db.update(recordings).set({ transcriptionStatus: "processing" }).where(eq(recordings.filename, safe));
    const result = await generateTranscription(filePath, {
      language,
      translate,
      onProgress: (pct) => setTranscriptionProgress(safe, pct),
      signal,
    });
    const stored = result.segments.length > 0
      ? JSON.stringify({ text: result.text, segments: result.segments })
      : result.text;
    await db.update(recordings).set({
      transcription: stored,
      transcriptionLang: result.language,
      transcriptionStatus: "done",
    }).where(eq(recordings.filename, safe));
    clearTranscriptionProgress(safe);
  }, language).catch(() => {
    clearTranscriptionProgress(safe);
    // Don't mark as error if cancelled — the DELETE handler manages the status
    if (!signal.aborted) {
      db.update(recordings).set({ transcriptionStatus: "error" }).where(eq(recordings.filename, safe)).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true, status: "pending" });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safe = basename(filename);
  if (safe !== filename || !filename.endsWith(".mp3")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Cancel any in-progress transcription
  cancelTranscription(safe);

  const db = getDb();

  // Check if cancel or clear: if there's existing text, keep it (revert to done)
  const cancel = req.nextUrl.searchParams.get("cancel") === "1";
  if (cancel) {
    const row = await db.select({ transcription: recordings.transcription }).from(recordings).where(eq(recordings.filename, safe)).get();
    if (row?.transcription) {
      await db.update(recordings).set({ transcriptionStatus: "done" }).where(eq(recordings.filename, safe));
      return NextResponse.json({ ok: true, action: "cancelled" });
    }
  }

  await db
    .update(recordings)
    .set({ transcription: null, transcriptionLang: null, transcriptionStatus: null })
    .where(eq(recordings.filename, safe));

  return NextResponse.json({ ok: true, action: cancel ? "cancelled" : "cleared" });
}
