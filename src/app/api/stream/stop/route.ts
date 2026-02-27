import { NextResponse } from "next/server";
import { getCaptureMode, setCaptureMode } from "@/lib/device-config";
import { isActive, stopUnit, restartUnit } from "@/lib/systemctl";

export async function POST() {
  try {
    const mode = await getCaptureMode();
    await setCaptureMode({ stream: false });
    const active = await isActive("auris-capture");
    if (active) {
      if (mode.record) {
        await restartUnit("auris-capture");
      } else {
        await stopUnit("auris-capture");
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to stop stream", detail: String(error) },
      { status: 500 }
    );
  }
}
