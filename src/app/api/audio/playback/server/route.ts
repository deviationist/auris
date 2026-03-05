import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { access, constants } from "fs/promises";
import { getActivePlayback, startPlayback, stopPlayback, isTalkbackActive } from "@/lib/server-playback";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "/recordings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ playback: getActivePlayback() });
}

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    // Sanitize filename — no path traversal
    if (filename.includes("/") || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    if (isTalkbackActive()) {
      return NextResponse.json(
        { error: "Cannot play while talkback is active" },
        { status: 409 }
      );
    }

    const filePath = join(RECORDINGS_DIR, filename);
    try {
      await access(filePath, constants.R_OK);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    await startPlayback(filePath, filename);
    return NextResponse.json({ ok: true, playback: getActivePlayback() });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start playback", detail: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  stopPlayback();
  return NextResponse.json({ ok: true });
}
