import { NextResponse } from "next/server";
import { startVox, isVoxActive } from "@/lib/vox";
import { isDirectRecording } from "@/lib/direct-record";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (isVoxActive()) {
      return NextResponse.json({ error: "VOX is already active" }, { status: 409 });
    }

    // Check for active manual recording (shares ALSA device)
    if (isDirectRecording()) {
      return NextResponse.json({ error: "Cannot start VOX while manual recording is active" }, { status: 409 });
    }

    let configOverrides: Record<string, number> | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        configOverrides = body;
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    await startVox(configOverrides);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to start VOX", detail: String(error) },
      { status: 500 }
    );
  }
}
