import { NextRequest, NextResponse } from "next/server";
import {
  getCaptureVolume,
  getMicBoost,
  getInputSource,
  setCaptureVolume,
  setMicBoost,
  setInputSource,
} from "@/lib/alsa";
import { getSelectedDevice } from "@/lib/device-config";

export const dynamic = "force-dynamic";

function cardFromDevice(alsaId: string): number {
  const match = alsaId.match(/^plughw:(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

export async function GET() {
  try {
    const card = cardFromDevice(await getSelectedDevice());
    const [capture, micBoost, inputSource] = await Promise.all([
      getCaptureVolume(card),
      getMicBoost(card),
      getInputSource(card),
    ]);
    return NextResponse.json({ capture, micBoost, inputSource });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read mixer", detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const card = cardFromDevice(await getSelectedDevice());
    const body = await request.json();
    const updated: string[] = [];

    if (body.capture !== undefined) {
      const val = Number(body.capture);
      if (isNaN(val) || val < 0 || val > 63) {
        return NextResponse.json(
          { error: "Capture must be 0–63" },
          { status: 400 }
        );
      }
      await setCaptureVolume(val, card);
      updated.push("capture");
    }

    if (body.micBoost !== undefined) {
      const val = Number(body.micBoost);
      if (isNaN(val) || val < 0 || val > 3) {
        return NextResponse.json(
          { error: "Mic Boost must be 0–3" },
          { status: 400 }
        );
      }
      await setMicBoost(val, card);
      updated.push("micBoost");
    }

    if (body.inputSource !== undefined) {
      await setInputSource(String(body.inputSource), card);
      updated.push("inputSource");
    }

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set mixer", detail: String(error) },
      { status: 500 }
    );
  }
}
