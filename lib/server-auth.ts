const AUTH_REALM = "Analytics";
export const MAX_PRIVATE_REQUEST_BYTES = 10 * 1024 * 1024;

function credentials(): { user: string; password: string } | null {
  const user = process.env.ANALYTICS_AUTH_USER;
  const password = process.env.ANALYTICS_AUTH_PASSWORD;
  return user && password ? { user, password } : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
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

function authResponse(status: 401 | 503, message: string): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  if (status === 401) {
    headers.set("WWW-Authenticate", `Basic realm="${AUTH_REALM}", charset="UTF-8"`);
  }
  return new Response(message, { status, headers });
}

/**
 * Temporary single-owner protection used until tenant sessions are implemented.
 * Local development stays open when credentials are intentionally absent.
 */
export function requireServerAuth(request: Request): Response | null {
  const expected = credentials();
  if (!expected) {
    return process.env.NODE_ENV === "production"
      ? authResponse(503, "Authentication is not configured")
      : null;
  }

  const actual = decodeBasicCredentials(request.headers.get("authorization"));
  if (
    !actual ||
    !constantTimeEqual(actual.user, expected.user) ||
    !constantTimeEqual(actual.password, expected.password)
  ) {
    return authResponse(401, "Authentication required");
  }

  return null;
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
