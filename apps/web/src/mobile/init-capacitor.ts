import {
  applyMobileApiBase,
  isCapacitorNative,
  parseDeepLinkPath,
  readMobileRuntimeConfig,
  resolveAuthCallbackUrl,
} from "@/lib/mobile/runtime";
import {
  registerNativeBridge,
  type NativeBridge,
} from "@/lib/mobile/native-bridge";
import {
  BEARER_STORAGE_KEY,
  hydrateMobileBearerFromPersist,
  setMobileTokenPersist,
} from "@/lib/session-sync/token-storage";

async function createCapacitorBridge(): Promise<NativeBridge> {
  const [{ App: CapacitorApp }, { Browser }, { Network }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/browser"),
    import("@capacitor/network"),
  ]);

  return {
    async openExternalUrl(url: string) {
      await Browser.open({ url, presentationStyle: "popover" });
    },
    addDeepLinkListener(handler) {
      const listener = CapacitorApp.addListener("appUrlOpen", (event) => {
        handler(event.url);
      });
      return () => {
        void listener.then((handle) => handle.remove());
      };
    },
    async getNetworkStatus() {
      const status = await Network.getStatus();
      return {
        connected: status.connected,
        connectionType: status.connectionType,
      };
    },
    addNetworkListener(handler) {
      const listener = Network.addListener("networkStatusChange", (status) => {
        handler({
          connected: status.connected,
          connectionType: status.connectionType,
        });
      });
      return () => {
        void listener.then((handle) => handle.remove());
      };
    },
  };
}

export async function initCapacitorShell(): Promise<void> {
  if (!isCapacitorNative()) return;

  const config = readMobileRuntimeConfig();
  applyMobileApiBase(config);
  registerNativeBridge(await createCapacitorBridge());

  const { Preferences } = await import("@capacitor/preferences");
  setMobileTokenPersist({
    async getBearerToken() {
      const stored = await Preferences.get({ key: BEARER_STORAGE_KEY });
      return stored.value;
    },
    async setBearerToken(token) {
      if (token) {
        await Preferences.set({ key: BEARER_STORAGE_KEY, value: token });
        return;
      }
      await Preferences.remove({ key: BEARER_STORAGE_KEY });
    },
  });
  await hydrateMobileBearerFromPersist();
}
