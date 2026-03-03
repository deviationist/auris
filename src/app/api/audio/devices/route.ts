import { NextResponse } from "next/server";
import { listCaptureDevices } from "@/lib/alsa";
import {
  getListenDevice,
  getRecordDevice,
  getStreamBitrate,
  getRecordBitrate,
} from "@/lib/device-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [devices, selectedListen, selectedRecord, streamBitrate, recordBitrate] =
      await Promise.all([
        listCaptureDevices(),
        getListenDevice(),
        getRecordDevice(),
        getStreamBitrate(),
        getRecordBitrate(),
      ]);
    return NextResponse.json({
      devices,
      selectedListen,
      selectedRecord,
      streamBitrate,
      recordBitrate,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list devices", detail: String(error) },
      { status: 500 }
    );
  }
}
