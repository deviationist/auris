import { NextResponse } from "next/server";
import {
  listCaptureDevices,
  getCaptureVolume,
  getMicBoost,
  getInputSource,
  getPlaybackVolume,
} from "@/lib/alsa";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const devices = await listCaptureDevices();
    // Get unique card numbers
    const cards = [...new Set(devices.map((d) => d.card))];

    const mixers = await Promise.all(
      cards.map(async (card) => {
        const cardDevice = devices.find((d) => d.card === card);
        const [capture, micBoost, inputSource, playbackVolume] = await Promise.all([
          getCaptureVolume(card),
          getMicBoost(card),
          getInputSource(card),
          getPlaybackVolume(card),
        ]);
        return {
          card,
          cardName: cardDevice?.cardName ?? `Card ${card}`,
          capture,
          micBoost,
          inputSource,
          playbackVolume,
        };
      })
    );

    return NextResponse.json(mixers);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read mixers", detail: String(error) },
      { status: 500 }
    );
  }
}
