/**
 * Resolves the API origin for browser fetch calls.
 * Next.js uses same-origin `/api` (empty base). Vite SPA can set VITE_API_BASE.
 */
declare const __VITE_API_BASE__: string | undefined;

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const runtimeBase = (
      window as Window & { __ANALYTICS_API_BASE__?: string }
    ).__ANALYTICS_API_BASE__;
    if (runtimeBase) return runtimeBase.replace(/\/$/, "");
  }

  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, "");
  }

  if (typeof __VITE_API_BASE__ === "string" && __VITE_API_BASE__) {
    return __VITE_API_BASE__.replace(/\/$/, "");
  }

  return "";
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBase()}${normalized}`;
}

export function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(apiUrl(path), init);
}
