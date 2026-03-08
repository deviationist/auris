import { NextResponse } from "next/server";
import { forceStopTalkback } from "@/lib/talkback";

export async function POST() {
  const stopped = forceStopTalkback();
  return NextResponse.json({ stopped });
}
