import { setRecordStartedAt, getRecordChunkMinutes, setRecordChunkPart } from "@/lib/device-config";
import { isVoxActive, stopVox } from "@/lib/vox";
import { startDirectRecording, stopDirectRecording, getDirectRecordingInfo } from "@/lib/direct-record";
import { scheduleChunk, cancelChunk } from "@/lib/record-chunker";

export async function startRecording(chunkPart?: number): Promise<void> {
  // Stop VOX if active (they share the ALSA device)
  if (isVoxActive()) {
    await stopVox();
  }

  const chunkMinutes = await getRecordChunkMinutes();

  // Set part number before starting
  if (chunkMinutes > 0) {
    await setRecordChunkPart(chunkPart ?? 1);
  } else {
    await setRecordChunkPart(null);
  }

  const filename = await startDirectRecording(chunkPart);
  const info = getDirectRecordingInfo();
  const startedAt = info?.startedAt ?? Date.now();

  await setRecordStartedAt(startedAt);

  console.log(`[record-actions] started recording: ${filename}`);

  scheduleChunk(chunkMinutes, startedAt);
}

/** Stop recording. Returns the chunk part number (0 if not chunking). */
export async function stopRecording(): Promise<number> {
  cancelChunk();

  const result = await stopDirectRecording();

  await setRecordStartedAt(null);
  await setRecordChunkPart(null);

  if (result) {
    console.log(`[record-actions] stopped recording: ${result.filename}`);
    return result.chunkPart;
  }

  return 0;
}
