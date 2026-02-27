import { NextResponse } from "next/server";
import { setCaptureMode } from "@/lib/device-config";
import { isActive, startUnit, restartUnit } from "@/lib/systemctl";

export async function POST() {
  try {
    await setCaptureMode({ stream: true });
    const active = await isActive("auris-capture");
    if (active) {
      await restartUnit("auris-capture");
    } else {
      await startUnit("auris-capture");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start stream", detail: String(error) },
      { status: 500 }
    );
  }
}
