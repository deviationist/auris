let chunkTimer: ReturnType<typeof setTimeout> | null = null;
let chunkInProgress = false;

export function scheduleChunk(minutes: number, startedAt: number) {
  cancelChunk();
  if (minutes <= 0) return;
  const elapsed = Date.now() - startedAt;
  const remaining = minutes * 60_000 - elapsed;
  if (remaining <= 0) {
    performChunk();
    return;
  }
  chunkTimer = setTimeout(performChunk, remaining);
}

export function cancelChunk() {
  if (chunkTimer) {
    clearTimeout(chunkTimer);
    chunkTimer = null;
  }
}

export function isChunking() {
  return chunkInProgress;
}

export function hasChunkTimer() {
  return chunkTimer !== null;
}

async function performChunk() {
  chunkTimer = null;
  chunkInProgress = true;
  try {
    // Dynamic import to avoid circular dependency
    const { stopRecording, startRecording } = await import("@/lib/record-actions");
    const prevPart = await stopRecording();
    await startRecording(prevPart + 1);
  } catch (err) {
    console.error("Chunk rotation failed:", err);
  } finally {
    chunkInProgress = false;
  }
}
