import { NextResponse } from "next/server";
import {
  createSessionToken,
  credentialsConfigured,
  sessionCookieOptions,
  verifyOwnerCredentials,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!credentialsConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: process.env.NODE_ENV === "production" ? 503 : 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const login = String(record.login ?? record.username ?? record.email ?? "");
  const password = String(record.password ?? "");
  const session = verifyOwnerCredentials(login, password);
  if (!session) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 },
    );
  }

  const token = createSessionToken(session.login);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication is not configured" },
      { status: 503 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    user: session,
  });
  response.cookies.set(sessionCookieOptions(token));
  return response;
}
