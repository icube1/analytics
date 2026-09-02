import type { LoginResponse, MeResponse } from "./contracts";
import { parseSessionApiError } from "./contracts";
import { resolveSessionClientKind } from "./client-kind";
import { getTokenStorage } from "./token-storage";
import { authenticatedFetch } from "./transport";

export interface AuthSessionState {
  me: MeResponse | null;
  isAuthenticated: boolean;
}

let cachedMe: MeResponse | null = null;

export function readCachedMe(): MeResponse | null {
  return cachedMe;
}

export function clearAuthSessionCache(): void {
  cachedMe = null;
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const clientKind = resolveSessionClientKind();
  const response = await authenticatedFetch("/auth/login", {
    method: "POST",
    skipCsrf: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, clientKind }),
  });

  if (!response.ok) throw await parseSessionApiError(response);

  const body = (await response.json()) as LoginResponse;
  const storage = getTokenStorage(clientKind);
  storage.setCsrfToken(body.csrfToken);
  if (clientKind === "mobile" && body.bearerToken) {
    storage.setBearerToken(body.bearerToken);
  }

  cachedMe = null;
  return body;
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await authenticatedFetch("/auth/me");
  if (!response.ok) throw await parseSessionApiError(response);
  const me = (await response.json()) as MeResponse;
  cachedMe = me;
  return me;
}

export async function logoutSession(): Promise<void> {
  const clientKind = resolveSessionClientKind();
  try {
    await authenticatedFetch("/auth/logout", { method: "POST" });
  } finally {
    getTokenStorage(clientKind).clear();
    clearAuthSessionCache();
  }
}

export async function refreshAuthState(): Promise<AuthSessionState> {
  try {
    const me = await fetchMe();
    return { me, isAuthenticated: true };
  } catch {
    clearAuthSessionCache();
    return { me: null, isAuthenticated: false };
  }
}
