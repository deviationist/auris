import { NextRequest, NextResponse } from "next/server";
import { getWhisperEnabled, setWhisperEnabled, getWhisperLanguage, setWhisperLanguage, getWhisperTranslate, setWhisperTranslate, getWhisperThreads, setWhisperThreads, getWhisperVad, setWhisperVad } from "@/lib/device-config";

export async function GET() {
  const [enabled, language, translate, threads, vad] = await Promise.all([getWhisperEnabled(), getWhisperLanguage(), getWhisperTranslate(), getWhisperThreads(), getWhisperVad()]);
  return NextResponse.json({ enabled, language, translate, threads, vad: vad.enabled, vadModel: vad.model });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  if (body.enabled !== undefined) {
    await setWhisperEnabled(!!body.enabled);
  }

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

  if (body.translate !== undefined) {
    await setWhisperTranslate(!!body.translate);
  }

  if (body.vad !== undefined) {
    await setWhisperVad(!!body.vad, body.vadModel);
  }

  const [enabled, language, translate, threads, vad] = await Promise.all([getWhisperEnabled(), getWhisperLanguage(), getWhisperTranslate(), getWhisperThreads(), getWhisperVad()]);
  return NextResponse.json({ ok: true, enabled, language, translate, threads, vad: vad.enabled, vadModel: vad.model });
}
