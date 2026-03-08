import { NextResponse } from "next/server";
import { stopVox, isVoxActive } from "@/lib/vox";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    if (!isVoxActive()) {
      return NextResponse.json({ ok: true, message: "VOX was not active" });
    }

    await stopVox();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to stop VOX", detail: String(error) },
      { status: 500 }
    );
  }
}
