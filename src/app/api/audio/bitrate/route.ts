import { NextRequest, NextResponse } from "next/server";
import { setStreamBitrate, setRecordBitrate } from "@/lib/device-config";

const VALID_BITRATES = ["64k", "96k", "128k", "192k", "256k", "320k"];

export async function POST(request: NextRequest) {
  try {
    const { bitrate, role } = await request.json();
    if (!bitrate || !VALID_BITRATES.includes(bitrate)) {
      return NextResponse.json(
        { error: `bitrate must be one of: ${VALID_BITRATES.join(", ")}` },
        { status: 400 }
      );
    }
    if (role !== "listen" && role !== "record") {
      return NextResponse.json(
        { error: "role must be 'listen' or 'record'" },
        { status: 400 }
      );
    }

    if (role === "listen") {
      // Monitor stream uses raw PCM — stream bitrate is no longer relevant
      // for listening, but we save it for potential future use.
      await setStreamBitrate(bitrate);
    } else {
      await setRecordBitrate(bitrate);
      // Recording bitrate change takes effect on next recording start.
    }

    return NextResponse.json({ ok: true, bitrate, role });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set bitrate", detail: String(error) },
      { status: 500 }
    );
  }
}
