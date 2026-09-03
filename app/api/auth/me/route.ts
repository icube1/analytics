import { NextResponse } from "next/server";
import { requireServerAuth, resolveOwnerSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = requireServerAuth(request);
  if (rejected) return rejected;

  const session = resolveOwnerSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true, user: session });
}
