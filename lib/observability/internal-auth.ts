import { requireServerAuth } from "@/lib/server-auth";

export function requireInternalObservabilityAuth(request: Request): Response | null {
  const token = process.env.OBSERVABILITY_TOKEN;
  if (token) {
    if (request.headers.get("authorization") === `Bearer ${token}`) return null;
    return new Response("Authentication required", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return requireServerAuth(request);
}
