import { NextResponse } from "next/server";
import { getTranscriptionQueueStatus } from "@/lib/transcription";

export async function GET() {
  return NextResponse.json(getTranscriptionQueueStatus());
}
