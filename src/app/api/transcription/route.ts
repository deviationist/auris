import { NextRequest, NextResponse } from "next/server";
import { getWhisperLanguage, setWhisperLanguage, getWhisperThreads, setWhisperThreads, getWhisperVad, setWhisperVad } from "@/lib/device-config";

export async function GET() {
  const [language, threads, vad] = await Promise.all([getWhisperLanguage(), getWhisperThreads(), getWhisperVad()]);
  return NextResponse.json({ language, threads, vad: vad.enabled, vadModel: vad.model });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  if (body.language !== undefined) {
    if (typeof body.language !== "string" || body.language.length === 0) {
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    }
    await setWhisperLanguage(body.language);
  }

  if (body.threads !== undefined) {
    const threads = parseInt(body.threads, 10);
    if (isNaN(threads) || threads < 0) {
      return NextResponse.json({ error: "Invalid threads value" }, { status: 400 });
    }
    await setWhisperThreads(threads);
  }

  if (body.vad !== undefined) {
    await setWhisperVad(!!body.vad, body.vadModel);
  }

  const [language, threads, vad] = await Promise.all([getWhisperLanguage(), getWhisperThreads(), getWhisperVad()]);
  return NextResponse.json({ ok: true, language, threads, vad: vad.enabled, vadModel: vad.model });
}
