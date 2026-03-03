import { type NextRequest } from "next/server";

const ICECAST_BASE = process.env.ICECAST_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(request.url);
  const upstream = `${ICECAST_BASE}/${path.join("/")}${url.search}`;

  const res = await fetch(upstream, {
    headers: { "icy-metadata": "0" },
  });

  if (!res.ok || !res.body) {
    return new Response(res.statusText, { status: res.status });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store",
    },
  });
}
