/**
 * Token storage boundary. Bearer tokens never touch localStorage; web uses
 * HttpOnly cookies for the session and keeps CSRF in sessionStorage only.
 */

const CSRF_STORAGE_KEY = "analytics.session.csrf.v1";
export const BEARER_STORAGE_KEY = "analytics.session.bearer.v1";

export interface TokenStorageAdapter {
  getCsrfToken(): string | null;
  setCsrfToken(token: string | null): void;
  getBearerToken(): string | null;
  setBearerToken(token: string | null): void;
  clear(): void;
}

let memoryCsrf: string | null = null;
let memoryBearer: string | null = null;

export interface MobileTokenPersist {
  getBearerToken(): string | null | Promise<string | null>;
  setBearerToken(token: string | null): void | Promise<void>;
}

let mobilePersist: MobileTokenPersist | null = null;

export function setMobileTokenPersist(adapter: MobileTokenPersist | null): void {
  mobilePersist = adapter;
}

export async function hydrateMobileBearerFromPersist(): Promise<void> {
  if (!mobilePersist) return;
  const token = await mobilePersist.getBearerToken();
  if (!token) return;
  memoryBearer = token;
  sessionStore()?.setItem(BEARER_STORAGE_KEY, token);
}

function sessionStore(): Storage | null {
  if (typeof globalThis.sessionStorage === "undefined") {
    return null;
  }
  return globalThis.sessionStorage;
}

export function createWebTokenStorage(): TokenStorageAdapter {
  return {
    getCsrfToken() {
      if (memoryCsrf) return memoryCsrf;
      return sessionStore()?.getItem(CSRF_STORAGE_KEY) ?? null;
    },
    setCsrfToken(token) {
      memoryCsrf = token;
      const store = sessionStore();
      if (!store) return;
      if (token) store.setItem(CSRF_STORAGE_KEY, token);
      else store.removeItem(CSRF_STORAGE_KEY);
    },
    getBearerToken() {
      return null;
    },
    setBearerToken() {
      // Web sessions rely on HttpOnly cookies; never persist bearer locally.
    },
    clear() {
      memoryCsrf = null;
      sessionStore()?.removeItem(CSRF_STORAGE_KEY);
    },
  };
}

export function createMobileTokenStorage(): TokenStorageAdapter {
  return {
    getCsrfToken() {
      return memoryCsrf;
    },
    setCsrfToken(token) {
      memoryCsrf = token;
    },
    getBearerToken() {
      if (memoryBearer) return memoryBearer;
      return sessionStore()?.getItem(BEARER_STORAGE_KEY) ?? null;
    },
    setBearerToken(token) {
      memoryBearer = token;
      const store = sessionStore();
      if (store) {
        if (token) store.setItem(BEARER_STORAGE_KEY, token);
        else store.removeItem(BEARER_STORAGE_KEY);
      }
      void mobilePersist?.setBearerToken(token);
    },
    clear() {
      memoryCsrf = null;
      memoryBearer = null;
      sessionStore()?.removeItem(BEARER_STORAGE_KEY);
      void mobilePersist?.setBearerToken(null);
    },
  };
}

let activeWebStorage: TokenStorageAdapter | null = null;
let activeMobileStorage: TokenStorageAdapter | null = null;

export function getTokenStorage(mode: "web" | "mobile"): TokenStorageAdapter {
  if (mode === "mobile") {
    if (!activeMobileStorage) activeMobileStorage = createMobileTokenStorage();
    return activeMobileStorage;
  }
  if (!activeWebStorage) activeWebStorage = createWebTokenStorage();
  return activeWebStorage;
}

export function resetTokenStorageForTests(): void {
  activeWebStorage = null;
  activeMobileStorage = null;
  memoryCsrf = null;
  memoryBearer = null;
}

export function clearAllSessionTokens(mode: "web" | "mobile"): void {
  getTokenStorage(mode).clear();
  resetTokenStorageForTests();
}
