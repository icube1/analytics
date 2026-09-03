import {
  buildAuthRedirectTarget,
  mapDeepLinkToAppPath,
  parseAuthCallbackPayload,
} from "@/lib/mobile/auth-callback";
import { resetTokenStorageForTests } from "@/lib/session-sync/token-storage";
import {
  registerNativeBridge,
  shouldOpenExternally,
} from "@/lib/mobile/native-bridge";
import {
  applyMobileApiBase,
  detectCapacitorPlatform,
  isCapacitorNative,
  parseDeepLinkPath,
  readMobileRuntimeConfig,
  resolveAuthCallbackUrl,
  shouldUseHashRouter,
} from "@/lib/mobile/runtime";

describe("mobile runtime", () => {
  it("detects web platform without Capacitor", () => {
    expect(detectCapacitorPlatform()).toBe("web");
    expect(isCapacitorNative()).toBe(false);
    expect(shouldUseHashRouter()).toBe(false);
  });

  it("reads injected mobile config and applies API base", () => {
    const win = globalThis as typeof globalThis & {
      window?: Window & {
        __ANALYTICS_MOBILE_CONFIG__?: { apiBase: string };
        __ANALYTICS_API_BASE__?: string;
      };
    };

    win.window = {
      __ANALYTICS_MOBILE_CONFIG__: { apiBase: "https://api.example.com" },
    } as unknown as Window & typeof globalThis & {
      __ANALYTICS_MOBILE_CONFIG__?: { apiBase: string };
      __ANALYTICS_API_BASE__?: string;
    };

    const config = readMobileRuntimeConfig();
    applyMobileApiBase(config);

    expect(config.apiBase).toBe("https://api.example.com");
    expect(win.window.__ANALYTICS_API_BASE__).toBe("https://api.example.com");
  });

  it("parses custom scheme deep links", () => {
    const config = readMobileRuntimeConfig({
      authCallbackScheme: "analytics",
      authCallbackPath: "/auth/callback",
    });

    expect(parseDeepLinkPath("analytics://app/auth/callback?token=abc", config)).toBe(
      "/auth/callback?token=abc",
    );
    expect(resolveAuthCallbackUrl(config)).toBe(
      "analytics://app/auth/callback",
    );
  });
});

describe("mobile auth callback", () => {
  it("parses OAuth-style callback params", () => {
    const payload = parseAuthCallbackPayload("?access_token=secret&state=/resilience");
    expect(payload.token).toBe("secret");
    expect(payload.state).toBe("/resilience");
  });

  it("stores token and redirects to state path", () => {
    resetTokenStorageForTests();
    const session = new Map<string, string>();
    const storage = {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => {
        session.set(key, value);
      },
      removeItem: (key: string) => {
        session.delete(key);
      },
      clear: () => session.clear(),
      key: () => null,
      length: 0,
    };

    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: storage,
    });

    const target = buildAuthRedirectTarget({
      token: "jwt",
      state: "/investments",
    });
    expect(target).toBe("/investments");
    expect(session.get("analytics.auth.callback-token.v1")).toBe("jwt");
    expect(session.get("analytics.session.bearer.v1")).toBe("jwt");
  });

  it("maps deep links to in-app routes", () => {
    const path = mapDeepLinkToAppPath(
      "https://app.gala-soft.ru/resilience",
      readMobileRuntimeConfig(),
    );
    expect(path).toBe("/resilience");
  });
});

describe("native bridge", () => {
  it("opens external links for off-origin URLs", () => {
    expect(
      shouldOpenExternally(
        "https://gala-soft.ru/privacy",
        "https://app.gala-soft.ru",
      ),
    ).toBe(true);
    expect(shouldOpenExternally("/resilience", "https://app.gala-soft.ru")).toBe(
      false,
    );
  });

  it("registers a native bridge on window", () => {
    const win = globalThis as typeof globalThis & {
      window?: Window & { __ANALYTICS_NATIVE_BRIDGE__?: unknown };
    };
    win.window = {} as unknown as Window &
      typeof globalThis & { __ANALYTICS_NATIVE_BRIDGE__?: unknown };

    registerNativeBridge({
      openExternalUrl: async () => {},
      addDeepLinkListener: () => () => {},
      getNetworkStatus: async () => ({ connected: true }),
      addNetworkListener: () => () => {},
    });

    expect(win.window.__ANALYTICS_NATIVE_BRIDGE__).toBeDefined();
  });
});
