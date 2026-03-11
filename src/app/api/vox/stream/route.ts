import { getVoxEmitter, getVoxStatus, type VoxLevelEvent } from "@/lib/vox";

export const dynamic = "force-dynamic";

export async function GET() {
  const emitter = getVoxEmitter();
  const encoder = new TextEncoder();
  let cleanedUp = false;
  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initial = getVoxStatus();
      if (!initial.active) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ state: "idle", currentLevel: -96 })}\n\n`));
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        state: initial.state,
        currentLevel: initial.currentLevel,
        threshold: initial.threshold,
        recordingDuration: initial.recordingDuration,
        recordingFilename: initial.recordingFilename,
        silenceRemaining: initial.silenceRemaining,
      })}\n\n`));

      const onLevel = (event: VoxLevelEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const onClose = () => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ state: "idle", currentLevel: -96 })}\n\n`));
          controller.close();
        } catch {}
        cleanup();
      };

      function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        emitter.off("level", onLevel);
        emitter.off("close", onClose);
        clearInterval(heartbeat);
      }

      cleanupFn = cleanup;

      emitter.on("level", onLevel);
      emitter.on("close", onClose);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);
    },
    cancel() {
      cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
