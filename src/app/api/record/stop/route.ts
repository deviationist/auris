import { NextResponse } from "next/server";
import { stopRecording } from "@/lib/record-actions";

export async function POST() {
  try {
    await stopRecording();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to stop recording", detail: String(error) },
      { status: 500 }
    );
  }
}
