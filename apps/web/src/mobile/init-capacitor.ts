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
}
