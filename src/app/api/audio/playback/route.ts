import { NextRequest, NextResponse } from "next/server";
import { listPlaybackDevices } from "@/lib/alsa";
import { getPlaybackDevice, setPlaybackDevice } from "@/lib/device-config";

export async function GET() {
  try {
    const [devices, selected] = await Promise.all([
      listPlaybackDevices(),
      getPlaybackDevice(),
    ]);
    return NextResponse.json({ devices, selected });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list playback devices", detail: String(error) },
      { status: 500 }
    );
  }
}

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
    await setPlaybackDevice(alsaId);
    return NextResponse.json({ ok: true, device: alsaId });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set playback device", detail: String(error) },
      { status: 500 }
    );
  }
}
