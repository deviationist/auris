import { NextResponse } from "next/server";
import { isActive } from "@/lib/systemctl";
import { spawn, ChildProcess } from "child_process";

let toneProcess: ChildProcess | null = null;

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
    const active = await isActive("auris-capture");
    if (active) {
      return NextResponse.json(
        { error: "Capture is active — stop it before sending a test tone" },
        { status: 409 }
      );
    }

    if (toneProcess && toneProcess.exitCode === null) {
      return NextResponse.json(
        { error: "Test tone already playing" },
        { status: 409 }
      );
    }

    toneProcess = spawn("ffmpeg", [
      "-re",
      "-f", "lavfi",
      "-i", "sine=frequency=440:duration=3",
      "-acodec", "libmp3lame",
      "-ab", "128k",
      "-ar", "44100",
      "-ac", "1",
      "-content_type", "audio/mpeg",
      "-f", "mp3",
      "icecast://source:sourcepass@localhost:8000/mic",
    ]);

    let stderr = "";
    toneProcess.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    toneProcess.on("error", (err) => {
      console.error("[test-tone] spawn error:", err);
      toneProcess = null;
    });

    toneProcess.on("exit", (code) => {
      if (code !== 0) {
        console.error(
          `[test-tone] ffmpeg exited with code ${code}:\n${stderr}`
        );
      }
      toneProcess = null;
    });

    // Wait until Icecast mount is live before telling the client to connect
    const ready = await waitForMount("http://localhost:8000/mic");
    if (!ready) {
      return NextResponse.json(
        { error: "Timed out waiting for stream to become available" },
        { status: 504 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start test tone", detail: String(error) },
      { status: 500 }
    );
  }
}
