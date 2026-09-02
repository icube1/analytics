/**
 * Capacitor / mobile WebView runtime helpers.
 * No direct @capacitor imports — safe for web, worker, and Jest contexts.
 */

export type MobilePlatform = "web" | "ios" | "android";

export interface MobileRuntimeConfig {
  apiBase: string;
  authCallbackScheme: string;
  authCallbackPath: string;
  deepLinkHosts: string[];
}

declare global {
  interface Window {
    __ANALYTICS_MOBILE_CONFIG__?: Partial<MobileRuntimeConfig>;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

const DEFAULT_CONFIG: MobileRuntimeConfig = {
  apiBase: "",
  authCallbackScheme: "analytics",
  authCallbackPath: "/auth/callback",
  deepLinkHosts: ["app.gala-soft.ru"],
};

export function detectCapacitorPlatform(): MobilePlatform {
  if (typeof window === "undefined") return "web";
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return "web";
  const platform = capacitor.getPlatform?.() ?? "web";
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  return "web";
}

export function isCapacitorNative(): boolean {
  return detectCapacitorPlatform() !== "web";
}

export function readMobileRuntimeConfig(
  overrides?: Partial<MobileRuntimeConfig>,
): MobileRuntimeConfig {
  const injected =
    typeof window !== "undefined"
      ? (window.__ANALYTICS_MOBILE_CONFIG__ ?? {})
      : {};

  return {
    ...DEFAULT_CONFIG,
    ...injected,
    ...overrides,
    deepLinkHosts: [
      ...DEFAULT_CONFIG.deepLinkHosts,
      ...(injected.deepLinkHosts ?? []),
      ...(overrides?.deepLinkHosts ?? []),
    ],
  };
}

export function applyMobileApiBase(config: MobileRuntimeConfig): void {
  if (typeof window === "undefined" || !config.apiBase) return;
  (
    window as Window & { __ANALYTICS_API_BASE__?: string }
  ).__ANALYTICS_API_BASE__ = config.apiBase.replace(/\/$/, "");
}

export function resolveAuthCallbackUrl(config: MobileRuntimeConfig): string {
  const path = config.authCallbackPath.startsWith("/")
    ? config.authCallbackPath
    : `/${config.authCallbackPath}`;
  return `${config.authCallbackScheme}://app${path}`;
}

export function parseDeepLinkPath(
  rawUrl: string,
  config: MobileRuntimeConfig,
): string | null {
  try {
    const url = new URL(rawUrl);
    const scheme = config.authCallbackScheme;

    if (url.protocol === `${scheme}:`) {
      const hostAndPath = `${url.host}${url.pathname}`;
      const normalized = hostAndPath.replace(/^app/, "");
      const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
      return `${path}${url.search}`;
    }

    if (
      config.deepLinkHosts.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    ) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function shouldUseHashRouter(): boolean {
  return isCapacitorNative();
}
