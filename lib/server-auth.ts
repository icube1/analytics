import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "analytics_session";
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
export const MAX_PRIVATE_REQUEST_BYTES = 10 * 1024 * 1024;
export const AUTH_PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
] as const;

const AUTH_JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export type OwnerSession = {
  login: string;
  role: "admin";
  displayName: string;
};

function credentials(): { user: string; password: string } | null {
  const user = process.env.ANALYTICS_AUTH_USER;
  const password = process.env.ANALYTICS_AUTH_PASSWORD;
  return user && password ? { user, password } : null;
}

export function credentialsConfigured(): boolean {
  return credentials() !== null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const length = Math.max(leftBuffer.length, rightBuffer.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  const lengthMismatch = leftBuffer.length !== rightBuffer.length;
  return timingSafeEqual(paddedLeft, paddedRight) && !lengthMismatch;
}

function decodeBasicCredentials(header: string | null): {
  user: string;
  password: string;
} | null {
  if (!header?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function sessionSecret(expected: { user: string; password: string }): string {
  const explicit = process.env.ANALYTICS_SESSION_SECRET;
  if (explicit) return explicit;
  return createHash("sha256")
    .update(`analytics-session-v1:${expected.user}:${expected.password}`)
    .digest("hex");
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function signSessionPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function ownerDisplayName(): string {
  return process.env.ANALYTICS_AUTH_DISPLAY_NAME?.trim() || "Администратор";
}

export function acceptedAdminLogins(user: string): string[] {
  const logins = new Set<string>([user, "admin"]);
  const extra = process.env.ANALYTICS_ADMIN_LOGIN?.trim();
  if (extra) logins.add(extra);
  if (!user.includes("@")) {
    logins.add(`${user}@gala-soft.ru`);
    logins.add("admin@gala-soft.ru");
  }
  return [...logins];
}

export function isAuthPublicPath(pathname: string): boolean {
  return AUTH_PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function wantsHtmlResponse(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  if (value === "/login" || value.startsWith("/login?")) return "/";
  return value;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    if (trimmed.slice(0, separator) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(separator + 1));
    } catch {
      return trimmed.slice(separator + 1);
    }
  }

  return null;
}

export function createSessionToken(
  login: string,
  expected = credentials(),
): string | null {
  if (!expected) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `v1.${encodeBase64Url(login)}.${exp}`;
  const signature = signSessionPayload(payload, sessionSecret(expected));
  return `${payload}.${signature}`;
}

export function readOwnerSession(request: Request): OwnerSession | null {
  const expected = credentials();
  if (!expected) return null;

  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [version, encodedLogin, expRaw, signature] = parts;
  if (!/^\d+$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= Date.now()) return null;

  const payload = `${version}.${encodedLogin}.${expRaw}`;
  const expectedSignature = signSessionPayload(payload, sessionSecret(expected));
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  const login = decodeBase64Url(encodedLogin);
  if (!login) return null;
  if (!acceptedAdminLogins(expected.user).some((alias) => constantTimeEqual(login, alias))) {
    return null;
  }

  return {
    login: expected.user,
    role: "admin",
    displayName: ownerDisplayName(),
  };
}

export function resolveOwnerSession(request: Request): OwnerSession | null {
  const fromCookie = readOwnerSession(request);
  if (fromCookie) return fromCookie;

  const actual = decodeBasicCredentials(request.headers.get("authorization"));
  if (!actual) return null;
  return verifyOwnerCredentials(actual.user, actual.password);
}

export function verifyOwnerCredentials(
  login: string,
  password: string,
): OwnerSession | null {
  const expected = credentials();
  if (!expected) return null;

  const loginMatched = acceptedAdminLogins(expected.user).some((alias) =>
    constantTimeEqual(login.trim(), alias),
  );
  if (!loginMatched || !constantTimeEqual(password, expected.password)) {
    return null;
  }

  return {
    login: expected.user,
    role: "admin",
    displayName: ownerDisplayName(),
  };
}

function authResponse(status: 401 | 503, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: AUTH_JSON_HEADERS,
  });
}

export function sessionCookieOptions(token: string): {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function clearSessionCookieOptions(): {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: 0;
} {
  return {
    ...sessionCookieOptions(""),
    maxAge: 0,
  };
}

/**
 * Single-owner gate used by the Next.js production app until Axum sessions
 * become the public API. Accepts a signed session cookie or Basic credentials
 * for machine clients. Never sends WWW-Authenticate, so browsers do not open
 * the native login dialog.
 */
export function requireServerAuth(request: Request): Response | null {
  const expected = credentials();
  if (!expected) {
    return process.env.NODE_ENV === "production"
      ? authResponse(503, "Authentication is not configured")
      : null;
  }

  if (readOwnerSession(request)) return null;

  const actual = decodeBasicCredentials(request.headers.get("authorization"));
  if (
    actual &&
    verifyOwnerCredentials(actual.user, actual.password)
  ) {
    return null;
  }

  return authResponse(401, "Authentication required");
}

export function rejectOversizedPrivateRequest(request: Request): Response | null {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return null;

  const length = Number(rawLength);
  if (Number.isFinite(length) && length > MAX_PRIVATE_REQUEST_BYTES) {
    return new Response("Request body is too large", {
      status: 413,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return null;
}
