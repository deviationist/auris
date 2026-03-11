import { NextResponse } from "next/server";
import { getRecordChunkMinutes, getClientRecordMaxMinutes, getCompressorConfig, getWhisperEnabled, getRecordStartedAt } from "@/lib/device-config";
import { isDirectRecording, getDirectRecordingInfo } from "@/lib/direct-record";
import { scheduleChunk, hasChunkTimer } from "@/lib/record-chunker";
import { getActivePlayback } from "@/lib/server-playback";
import { getVoxStatus } from "@/lib/vox";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const recording = isDirectRecording();
    const recordingInfo = getDirectRecordingInfo();

    const recording_file = recordingInfo?.filename ?? null;
    const recording_started = recordingInfo?.startedAt ?? (recording ? await getRecordStartedAt() : null);

    const record_chunk_minutes = await getRecordChunkMinutes();
    const client_record_max_minutes = await getClientRecordMaxMinutes();

    // Recover chunk timer after server restart (e.g. PM2 reload)
    if (recording && record_chunk_minutes > 0 && recording_started && !hasChunkTimer()) {
      scheduleChunk(record_chunk_minutes, recording_started);
    }

    const server_playback = getActivePlayback();
    const vox = getVoxStatus();
    const compressor = await getCompressorConfig();
    const whisper_enabled = await getWhisperEnabled();

    return NextResponse.json({
      recording,
      recording_file,
      recording_started,
      record_chunk_minutes,
      client_record_max_minutes,
      server_playback,
      vox,
      compressor,
      whisper_enabled,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get status", detail: String(error) },
      { status: 500 }
    );
  }
}
