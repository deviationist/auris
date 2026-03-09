import { NextRequest, NextResponse } from "next/server";
import { getCompressorConfig, setCompressorConfig } from "@/lib/device-config";
import { isActive, stopUnit, startUnit } from "@/lib/systemctl";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getCompressorConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get compressor config", detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await setCompressorConfig(body);

    const streamWasActive = await isActive("auris-stream");
    if (streamWasActive) {
      await stopUnit("auris-stream");
      await startUnit("auris-stream");
    }

    const config = await getCompressorConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set compressor config", detail: String(error) },
      { status: 500 }
    );
  }
}
