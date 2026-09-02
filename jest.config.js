/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  testTimeout: 30_000,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  modulePathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/.platform-local/",
    "<rootDir>/.platform-release-staging/",
  ],
};

module.exports = config;
