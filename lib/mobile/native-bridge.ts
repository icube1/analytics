/**
 * Native bridge contract between the Vite bundle and Capacitor plugins.
 * Implementations register at runtime from apps/web/src/mobile/init-capacitor.ts.
 */

export interface NetworkStatusSnapshot {
  connected: boolean;
  connectionType?: string;
}

export interface NativeBridge {
  openExternalUrl(url: string): Promise<void>;
  addDeepLinkListener(handler: (url: string) => void): () => void;
  getNetworkStatus(): Promise<NetworkStatusSnapshot>;
  addNetworkListener(
    handler: (status: NetworkStatusSnapshot) => void,
  ): () => void;
}

declare global {
  interface Window {
    __ANALYTICS_NATIVE_BRIDGE__?: NativeBridge;
  }
}

let registeredBridge: NativeBridge | null = null;

export function registerNativeBridge(bridge: NativeBridge): void {
  registeredBridge = bridge;
  if (typeof window !== "undefined") {
    window.__ANALYTICS_NATIVE_BRIDGE__ = bridge;
  }
}

export function getNativeBridge(): NativeBridge | null {
  if (registeredBridge) return registeredBridge;
  if (typeof window !== "undefined") {
    return window.__ANALYTICS_NATIVE_BRIDGE__ ?? null;
  }
  return null;
}

export async function openExternalUrl(url: string): Promise<void> {
  const bridge = getNativeBridge();
  if (bridge) {
    await bridge.openExternalUrl(url);
    return;
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function shouldOpenExternally(
  href: string,
  appOrigin = typeof window !== "undefined" ? window.location.origin : "",
): boolean {
  if (!href || href.startsWith("#") || href.startsWith("/")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;

  try {
    const target = new URL(href, appOrigin || "https://app.gala-soft.ru");
    const origin = appOrigin || "https://app.gala-soft.ru";
    return target.origin !== new URL(origin).origin;
  } catch {
    return false;
  }
}
