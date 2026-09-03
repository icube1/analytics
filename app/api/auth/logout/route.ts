import { NextResponse } from "next/server";
import { clearSessionCookieOptions } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearSessionCookieOptions());
  return response;
}
