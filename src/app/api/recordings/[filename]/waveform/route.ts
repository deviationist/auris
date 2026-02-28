import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import { join, basename } from "path";
import { generateWaveform } from "@/lib/waveform";

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

  const mp3Path = join(RECORDINGS_DIR, safe);
  const cachePath = join(RECORDINGS_DIR, `${safe}.waveform.json`);

  // Try cache first
  try {
    await access(cachePath);
    const cached = await readFile(cachePath, "utf-8");
    return new Response(cached, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // No cache, generate below
  }

  // Check that the MP3 exists
  try {
    await access(mp3Path);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const peaks = await generateWaveform(mp3Path, cachePath);
    return new Response(JSON.stringify(peaks), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate waveform", detail: String(error) },
      { status: 500 }
    );
  }
}
