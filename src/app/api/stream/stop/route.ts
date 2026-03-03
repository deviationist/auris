import { NextResponse } from "next/server";
import { setCaptureMode } from "@/lib/device-config";
import { stopUnit } from "@/lib/systemctl";

export async function POST() {
  try {
    await setCaptureMode({ stream: false });
    await stopUnit("auris-stream");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to stop stream", detail: String(error) },
      { status: 500 }
    );
  }
}
