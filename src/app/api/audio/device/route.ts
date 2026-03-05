import { NextRequest, NextResponse } from "next/server";
import { setListenDevice, setRecordDevice } from "@/lib/device-config";
import { isActive, stopUnit, startUnit } from "@/lib/systemctl";

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
      const streamWasActive = await isActive("auris-stream");
      if (streamWasActive) await stopUnit("auris-stream");
      await setListenDevice(alsaId);
      if (streamWasActive) await startUnit("auris-stream");
    } else {
      const recordWasActive = await isActive("auris-record");
      if (recordWasActive) await stopUnit("auris-record");
      await setRecordDevice(alsaId);
      if (recordWasActive) await startUnit("auris-record");
    }

    return NextResponse.json({ ok: true, device: alsaId, role });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set device", detail: String(error) },
      { status: 500 }
    );
  }
}
