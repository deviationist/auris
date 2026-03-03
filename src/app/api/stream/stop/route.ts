import { NextResponse } from "next/server";
import { setCaptureMode } from "@/lib/device-config";
import { isActive, stopUnit } from "@/lib/systemctl";

export async function POST() {
  try {
    await setCaptureMode({ stream: false });
    const recording = await isActive("auris-record");
    if (!recording) {
      await stopUnit("auris-stream");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to stop stream", detail: String(error) },
      { status: 500 }
    );
  }
}
