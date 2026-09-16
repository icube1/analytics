import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

function packageVersion(): string {
  try {
    const parsed = JSON.parse(readFileSync("./package.json", "utf8")) as {
      version?: string;
    };
    return parsed.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    APP_VERSION: packageVersion(),
    APP_GIT_SHA: gitSha(),
    APP_BUILT_AT: new Date().toISOString(),
  },
  outputFileTracingExcludes: {
    "*": STANDALONE_TRACE_EXCLUDES,
  },
};

export default nextConfig;
