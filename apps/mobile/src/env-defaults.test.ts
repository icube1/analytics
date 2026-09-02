import { describe, expect, it } from "vitest";
import { loadMobileEnvDefaults } from "./env-defaults";

describe("mobile env defaults", () => {
  it("reads API base without trailing slash normalization in loader", () => {
    const env = loadMobileEnvDefaults({
      MOBILE_API_BASE: "https://api.example.com/",
      MOBILE_AUTH_SCHEME: "analytics",
    });

    expect(env.apiBase).toBe("https://api.example.com/");
    expect(env.authScheme).toBe("analytics");
  });
});
