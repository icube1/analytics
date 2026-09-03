import { NextResponse, type NextRequest } from "next/server";
import {
  isAuthPublicPath,
  requireServerAuth,
  safeNextPath,
  wantsHtmlResponse,
} from "@/lib/server-auth";

export function proxy(request: NextRequest) {
  if (isAuthPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const rejected = requireServerAuth(request);
  if (!rejected) return NextResponse.next();

  if (request.method === "GET" && wantsHtmlResponse(request)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const next = safeNextPath(request.nextUrl.pathname + request.nextUrl.search);
    if (next !== "/") loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  return rejected;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
