import { NextResponse, type NextRequest } from "next/server";
import { requireServerAuth } from "@/lib/server-auth";

export function proxy(request: NextRequest) {
  return requireServerAuth(request) ?? NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
