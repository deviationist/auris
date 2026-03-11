import { NextResponse } from "next/server";
import { getVoxConfig, setVoxConfig, type VoxConfig } from "@/lib/device-config";
import { updateVoxConfig } from "@/lib/vox";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getVoxConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get VOX config", detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body: Partial<VoxConfig> = await req.json();
    const current = await getVoxConfig();

    const updated: VoxConfig = {
      threshold: body.threshold ?? current.threshold,
      triggerMs: body.triggerMs ?? current.triggerMs,
      preBufferSecs: body.preBufferSecs ?? current.preBufferSecs,
      postSilenceSecs: body.postSilenceSecs ?? current.postSilenceSecs,
    };

    await setVoxConfig(updated);
    updateVoxConfig(updated);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save VOX config", detail: String(error) },
      { status: 500 }
    );
  }
}
