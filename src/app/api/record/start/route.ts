import { NextResponse } from "next/server";
import { setCaptureMode, setRecordStartedAt } from "@/lib/device-config";
import { startUnit } from "@/lib/systemctl";

export async function POST() {
  try {
    const startedAt = Date.now();
    await setCaptureMode({ record: true });
    await setRecordStartedAt(startedAt);

    await startUnit("auris-record");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start recording", detail: String(error) },
      { status: 500 }
    );
  }
}
