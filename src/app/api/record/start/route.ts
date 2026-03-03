import { NextResponse } from "next/server";
import { setCaptureMode, setRecordStartedAt } from "@/lib/device-config";
import { isActive, startUnit } from "@/lib/systemctl";

async function waitForMount(
  url: string,
  timeoutMs: number = 5000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const res = await fetch(url, { signal: controller.signal });
      controller.abort();
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export async function POST() {
  try {
    const startedAt = Date.now();
    await setCaptureMode({ record: true });
    await setRecordStartedAt(startedAt);

    // Ensure stream is running (recording reads from Icecast)
    const streamActive = await isActive("auris-stream");
    if (!streamActive) {
      await startUnit("auris-stream");
    }

    // Wait for Icecast mount to be available
    const ready = await waitForMount("http://localhost:8000/mic");
    if (!ready) {
      return NextResponse.json(
        { error: "Timed out waiting for Icecast mount" },
        { status: 504 }
      );
    }

    // Start the recorder — the file won't appear on disk for several seconds
    // (ffmpeg needs to connect to Icecast and buffer). The status API will
    // detect the new file and insert it into the DB when it appears.
    await startUnit("auris-record");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start recording", detail: String(error) },
      { status: 500 }
    );
  }
}
