import { NextRequest, NextResponse } from "next/server";
import { getCompressorConfig, setCompressorConfig } from "@/lib/device-config";

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

    // Compressor applies to recording. If currently recording, the new settings
    // will take effect on the next recording start (no live restart needed since
    // restarting mid-recording would create gaps).

    const config = await getCompressorConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to set compressor config", detail: String(error) },
      { status: 500 }
    );
  }
}
