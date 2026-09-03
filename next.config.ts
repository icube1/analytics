import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const linkedomBrowserStub = path.join(
  configDir,
  "lib/broker-adapters/linkedom-browser-stub.ts",
);

const STANDALONE_TRACE_EXCLUDES = [
  "./target/**",
  "./crates/**",
  "./apps/**",
  "./docs/**",
  "./fixtures/**",
  "./deploy/**",
  "./__tests__/**",
  "./scripts/**",
  "./coverage/**",
  "./*.tsbuildinfo",
  "./Cargo.lock",
  "./Cargo.toml",
  "./rust-toolchain.toml",
  "./jest.config.js",
  "./eslint.config.mjs",
  "./README.md",
  "./AGENTS.md",
  "./CLAUDE.md",
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": STANDALONE_TRACE_EXCLUDES,
  },
  serverExternalPackages: ["linkedom"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      const alias = config.resolve?.alias;
      if (Array.isArray(alias)) {
        alias.push({ name: "linkedom", alias: linkedomBrowserStub });
      } else {
        config.resolve = config.resolve ?? {};
        config.resolve.alias = {
          ...(typeof alias === "object" && alias ? alias : {}),
          linkedom: linkedomBrowserStub,
        };
      }
    }
    return config;
  },
};

export default nextConfig;
