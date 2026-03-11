import { NextResponse } from "next/server";
import { stopCurrentRecording } from "@/lib/vox";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const stopped = await stopCurrentRecording();
    return NextResponse.json({ stopped });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to stop recording", detail: String(error) },
      { status: 500 }
    );
  }
}
