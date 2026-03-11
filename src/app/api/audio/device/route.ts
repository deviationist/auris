import { NextRequest, NextResponse } from "next/server";
import { setListenDevice, setRecordDevice } from "@/lib/device-config";

export async function POST(request: NextRequest) {
  try {
    const { alsaId, role } = await request.json();
    if (!alsaId || typeof alsaId !== "string") {
      return NextResponse.json({ error: "Missing alsaId" }, { status: 400 });
    }
    if (!/^plughw:CARD=\w+,DEV=\d+$/.test(alsaId)) {
      return NextResponse.json(
        { error: "Invalid device format" },
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
      await setListenDevice(alsaId);
      // Monitor stream manages its own ffmpeg lifecycle — client will
      // disconnect and reconnect with the new device automatically.
    } else {
      await setRecordDevice(alsaId);
      // Recording device change takes effect on next recording start.
    }

    return NextResponse.json({ ok: true, device: alsaId, role });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set device", detail: String(error) },
      { status: 500 }
    );
  }
}
