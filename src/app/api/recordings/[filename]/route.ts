import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat, unlink } from "fs/promises";
import { join, basename } from "path";
import { Readable } from "stream";
import { getDb } from "@/lib/db";
import { recordings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Sanitize: only allow simple filenames, no path traversal
  const safe = basename(filename);
  if (safe !== filename || !filename.endsWith(".mp3")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = join(RECORDINGS_DIR, safe);

  try {
    const s = await stat(filePath);
    const rangeHeader = _request.headers.get("range");

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      const start = match ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : s.size - 1;
      const chunkSize = end - start + 1;

      const stream = createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(stream) as ReadableStream;

      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${s.size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(s.size),
        "Content-Disposition": `inline; filename="${safe}"`,
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to read file", detail: String(error) },
      { status: 500 }
    );
  }
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

  const filePath = join(RECORDINGS_DIR, safe);

  try {
    await unlink(filePath);

    // Remove from DB
    const db = getDb();
    await db.delete(recordings).where(eq(recordings.filename, safe));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to delete file", detail: String(error) },
      { status: 500 }
    );
  }
}
