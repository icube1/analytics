import {
  formatAppReleaseLabel,
  formatBuiltAt,
  readAppBuildInfo,
  shortSha,
} from "@/lib/app-build-info";

describe("app build info footer label", () => {
  it("reads version, sha and build time from env", () => {
    const info = readAppBuildInfo({
      APP_VERSION: "0.1.0",
      APP_GIT_SHA: "a67a3ada9f33787cc8b54838d5fecf35dd7d61f8",
      APP_BUILT_AT: "2026-09-16T06:55:00Z",
    } as NodeJS.ProcessEnv);

    expect(info.version).toBe("0.1.0");
    expect(shortSha(info.sha)).toBe("a67a3ad");
    expect(formatBuiltAt(info.builtAt)).toBe("16.09.2026, 09:55");
    expect(formatAppReleaseLabel(info)).toBe(
      "Версия 0.1.0 (a67a3ad) · обновлено 16.09.2026, 09:55",
    );
  });

  it("falls back to version only when sha and date are missing", () => {
    expect(formatAppReleaseLabel(readAppBuildInfo({} as NodeJS.ProcessEnv))).toBe(
      "Версия 0.1.0",
    );
  });
});
