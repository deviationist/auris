import { NextRequest, NextResponse } from "next/server";
import { setStreamBitrate, setRecordBitrate } from "@/lib/device-config";
import { isActive, stopUnit, startUnit } from "@/lib/systemctl";

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
      const streamWasActive = await isActive("auris-stream");
      if (streamWasActive) await stopUnit("auris-stream");
      await setStreamBitrate(bitrate);
      if (streamWasActive) await startUnit("auris-stream");
    } else {
      const recordWasActive = await isActive("auris-record");
      if (recordWasActive) await stopUnit("auris-record");
      await setRecordBitrate(bitrate);
      if (recordWasActive) await startUnit("auris-record");
    }

    return NextResponse.json({ ok: true, bitrate, role });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set bitrate", detail: String(error) },
      { status: 500 }
    );
  }
}
