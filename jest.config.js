/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  testTimeout: 30_000,
  setupFiles: ["<rootDir>/lib/broker-adapters/install-node-dom-parser.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  modulePathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/.platform-local/",
    "<rootDir>/.platform-release-staging/",
    "<rootDir>/apps/.*/dist/",
  ],
};

module.exports = config;
