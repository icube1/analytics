import { getTokenStorage } from "../session-sync/token-storage";
import {
  parseDeepLinkPath,
  readMobileRuntimeConfig,
  type MobileRuntimeConfig,
} from "./runtime";

const AUTH_TOKEN_STORAGE_KEY = "analytics.auth.callback-token.v1";

export interface AuthCallbackPayload {
  token?: string;
  error?: string;
  state?: string;
}

export function parseAuthCallbackPayload(
  search: string,
  hash = "",
): AuthCallbackPayload {
  const params = new URLSearchParams(search || hash.replace(/^#/, ""));
  return {
    token: params.get("token") ?? params.get("access_token") ?? undefined,
    error: params.get("error") ?? undefined,
    state: params.get("state") ?? undefined,
  };
}

export function storeAuthCallbackToken(token: string): void {
  getTokenStorage("mobile").setBearerToken(token);
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function readStoredAuthCallbackToken(): string | null {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return null;
  }
  return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function clearStoredAuthCallbackToken(): void {
  getTokenStorage("mobile").setBearerToken(null);
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function mapDeepLinkToAppPath(
  rawUrl: string,
  config: MobileRuntimeConfig = readMobileRuntimeConfig(),
): string | null {
  const path = parseDeepLinkPath(rawUrl, config);
  if (!path) return null;
  return path.startsWith("/") ? path : `/${path}`;
}

export function buildAuthRedirectTarget(
  payload: AuthCallbackPayload,
  fallbackPath = "/",
): string {
  if (payload.error) {
    const params = new URLSearchParams({ auth_error: payload.error });
    return `${fallbackPath}?${params.toString()}`;
  }
  if (payload.token) {
    storeAuthCallbackToken(payload.token);
  }
  return payload.state && payload.state.startsWith("/")
    ? payload.state
    : fallbackPath;
}
