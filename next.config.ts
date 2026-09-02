import type { NextConfig } from "next";

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
};

export default nextConfig;
