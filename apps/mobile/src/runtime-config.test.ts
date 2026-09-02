import { describe, expect, it } from "vitest";
import { buildMobileRuntimePayload } from "./runtime-config";

describe("mobile runtime config", () => {
  it("builds secure API base payload from env", () => {
    const payload = buildMobileRuntimePayload({
      apiBase: "https://app.gala-soft.ru",
      authScheme: "analytics",
      authCallbackPath: "/auth/callback",
      extraDeepLinkHosts: ["api.gala-soft.ru"],
      appId: "ru.galasoft.analytics",
      appName: "Analytics",
    });

    expect(payload.apiBase).toBe("https://app.gala-soft.ru");
    expect(payload.authCallbackScheme).toBe("analytics");
    expect(payload.deepLinkHosts).toContain("api.gala-soft.ru");
  });

  it("defaults auth callback scheme when unset", () => {
    const payload = buildMobileRuntimePayload({
      apiBase: "",
      authScheme: "",
      authCallbackPath: "/auth/callback",
      extraDeepLinkHosts: [],
      appId: "ru.galasoft.analytics",
      appName: "Analytics",
    });

    expect(payload.authCallbackScheme).toBe("analytics");
  });
});
