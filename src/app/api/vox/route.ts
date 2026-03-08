import { NextResponse } from "next/server";
import { getVoxStatus } from "@/lib/vox";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getVoxStatus());
}
