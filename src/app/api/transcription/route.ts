import { NextRequest, NextResponse } from "next/server";
import { getWhisperLanguage, setWhisperLanguage } from "@/lib/device-config";

export async function GET() {
  const language = await getWhisperLanguage();
  return NextResponse.json({ language });
}

export async function PUT(req: NextRequest) {
  const { language } = await req.json();
  if (typeof language !== "string" || language.length === 0) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }
  await setWhisperLanguage(language);
  return NextResponse.json({ ok: true, language });
}
