import { NextResponse } from "next/server";
import { getRecordChunkMinutes, setRecordChunkMinutes, getRecordStartedAt } from "@/lib/device-config";
import { isDirectRecording } from "@/lib/direct-record";
import { scheduleChunk } from "@/lib/record-chunker";

export async function GET() {
  try {
    const minutes = await getRecordChunkMinutes();
    return NextResponse.json({ minutes });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read chunk config", detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { minutes } = await request.json();
    if (typeof minutes !== "number" || minutes < 0) {
      return NextResponse.json({ error: "Invalid minutes" }, { status: 400 });
    }
    await setRecordChunkMinutes(minutes);

    // Reschedule timer if currently recording
    if (isDirectRecording()) {
      const startedAt = await getRecordStartedAt();
      if (startedAt) {
        scheduleChunk(minutes, startedAt);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set chunk config", detail: String(error) },
      { status: 500 }
    );
  }
}
