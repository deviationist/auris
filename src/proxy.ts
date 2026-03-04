import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { isAuthEnabled } from "@/lib/auth-config";

export async function proxy(request: NextRequest) {
  if (!(await isAuthEnabled())) {
    return NextResponse.next();
  }
  return (auth as unknown as (req: NextRequest) => Promise<Response>)(request);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
