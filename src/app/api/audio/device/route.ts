import { NextRequest, NextResponse } from "next/server";
import { setSelectedDevice } from "@/lib/device-config";
import { isActive, stopUnit, startUnit } from "@/lib/systemctl";

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

    const [streamWasActive, recordActive] = await Promise.all([
      isActive("auris-stream"),
      isActive("auris-record"),
    ]);

    // Stop both services before changing device
    if (recordActive) await stopUnit("auris-record");
    if (streamWasActive) await stopUnit("auris-stream");

    await setSelectedDevice(alsaId);

    // Restart stream if it was running
    if (streamWasActive) await startUnit("auris-stream");

    return NextResponse.json({ ok: true, device: alsaId });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set device", detail: String(error) },
      { status: 500 }
    );
  }
}
