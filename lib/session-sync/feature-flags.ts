/**
 * Experimental web/mobile session sync. Off by default so Basic-auth +
 * local-first Next backup remains the production path until cutover.
 */
declare const __VITE_WEB_SESSION_SYNC__: string | undefined;

export const WEB_SESSION_SYNC_ENV_KEYS = [
  "VITE_WEB_SESSION_SYNC",
  "NEXT_PUBLIC_WEB_SESSION_SYNC",
] as const;

function readEnvFlag(): string | undefined {
  if (typeof process !== "undefined") {
    for (const key of WEB_SESSION_SYNC_ENV_KEYS) {
      const value = process.env[key];
      if (value != null && value !== "") return value;
    }
  }

  if (typeof __VITE_WEB_SESSION_SYNC__ === "string" && __VITE_WEB_SESSION_SYNC__) {
    return __VITE_WEB_SESSION_SYNC__;
  }

  return undefined;
}

export function parseFeatureFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function isWebSessionSyncFeatureEnabled(): boolean {
  return parseFeatureFlag(readEnvFlag());
}
