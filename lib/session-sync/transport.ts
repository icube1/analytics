import { apiUrl } from "@/lib/api-base";
import { CSRF_HEADER } from "./contracts";
import { getTokenStorage } from "./token-storage";
import { resolveSessionClientKind } from "./client-kind";

export const SESSION_API_PREFIX = "/api/v1";

export function sessionApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return apiUrl(`${SESSION_API_PREFIX}${normalized}`);
}

export interface AuthenticatedFetchOptions extends RequestInit {
  skipCsrf?: boolean;
}

export function authenticatedFetch(
  path: string,
  init: AuthenticatedFetchOptions = {},
): Promise<Response> {
  const kind = resolveSessionClientKind();
  const storage = getTokenStorage(kind);
  const headers = new Headers(init.headers ?? {});

  if (kind === "mobile") {
    const bearer = storage.getBearerToken();
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  }

  const method = (init.method ?? "GET").toUpperCase();
  const needsCsrf =
    !init.skipCsrf &&
    kind === "web" &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (needsCsrf) {
    const csrf = storage.getCsrfToken();
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }

  return fetch(sessionApiUrl(path), {
    ...init,
    method,
    headers,
    credentials: kind === "web" ? "include" : init.credentials,
  });
}
