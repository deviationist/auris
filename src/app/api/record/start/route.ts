import { NextResponse } from "next/server";
import { startRecording } from "@/lib/record-actions";

export async function POST() {
  try {
    await startRecording();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start recording", detail: String(error) },
      { status: 500 }
    );
  }
}
