import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

describe("vite api proxy contract", () => {
  it("proxies /api to VITE_API_PROXY_TARGET in dev and preview", () => {
    const configSource = readFileSync(
      path.resolve(webRoot, "../vite.config.ts"),
      "utf8",
    );
    expect(configSource).toMatch(/VITE_API_PROXY_TARGET/);
    expect(configSource).toMatch(/['"]\/api['"]/);
    expect(configSource).toMatch(/changeOrigin:\s*true/);
    expect(configSource).toMatch(/server:\s*\{[\s\S]*proxy:/);
    expect(configSource).toMatch(/preview:\s*\{[\s\S]*proxy:/);
  });
});
