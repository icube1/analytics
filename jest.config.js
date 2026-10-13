/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolate: false }],
    '^.+\\.js$': 'babel-jest',
  },
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.test.{ts,js}"],
  transformIgnorePatterns: [
    "/node_modules/(?!(ts-jest)/)",
  ],
  testTimeout: 30_000,
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
