import { NextResponse } from "next/server";
import { listCaptureDevices } from "@/lib/alsa";
import { getSelectedDevice } from "@/lib/device-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [devices, selected] = await Promise.all([
      listCaptureDevices(),
      getSelectedDevice(),
    ]);
    return NextResponse.json({ devices, selected });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list devices", detail: String(error) },
      { status: 500 }
    );
  }
}
