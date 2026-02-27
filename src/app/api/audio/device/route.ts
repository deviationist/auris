import { NextRequest, NextResponse } from "next/server";
import { setSelectedDevice } from "@/lib/device-config";
import { isActive, restartUnit } from "@/lib/systemctl";

export async function POST(request: NextRequest) {
  try {
    const { alsaId } = await request.json();
    if (!alsaId || typeof alsaId !== "string") {
      return NextResponse.json({ error: "Missing alsaId" }, { status: 400 });
    }
    if (!/^plughw:\d+,\d+$/.test(alsaId)) {
      return NextResponse.json(
        { error: "Invalid device format" },
        { status: 400 }
      );
    }

    await setSelectedDevice(alsaId);

    // Restart capture service if running so it picks up the new device
    const active = await isActive("auris-capture");
    if (active) await restartUnit("auris-capture");

    return NextResponse.json({ ok: true, device: alsaId });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set device", detail: String(error) },
      { status: 500 }
    );
  }
}
