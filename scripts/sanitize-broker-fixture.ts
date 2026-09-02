import fs from "node:fs";
import path from "node:path";
import {
  sanitizeBrokerFixture,
} from "../lib/broker-fixture-sanitize";

export {
  SANITIZED_ACCOUNT,
  SANITIZED_ADDRESS,
  SANITIZED_CONTRACT,
  SANITIZED_EMAIL,
  SANITIZED_INVESTOR,
  SANITIZED_PHONE,
  sanitizeBrokerFixture,
} from "../lib/broker-fixture-sanitize";

const DEFAULT_FIXTURES = [
  "public/portfolio.html",
  "__tests__/fixtures/sber-t1-report.html",
];

export function sanitizeFixtureFile(filePath: string): void {
  const original = fs.readFileSync(filePath, "utf8");
  const sanitized = sanitizeBrokerFixture(original);
  fs.writeFileSync(filePath, sanitized, "utf8");
}

export function assertFixtureSanitized(filePath: string): void {
  const original = fs.readFileSync(filePath, "utf8");
  const sanitized = sanitizeBrokerFixture(original);
  if (sanitized !== original) {
    throw new Error(`Fixture is not sanitized: ${filePath}`);
  }
}

function runCli(): void {
  const checkOnly = process.argv.includes("--check");
  const fixturePaths = process.argv
    .slice(2)
    .filter((arg) => arg !== "--check");

  const paths = fixturePaths.length > 0 ? fixturePaths : DEFAULT_FIXTURES;

  for (const fixturePath of paths) {
    const resolved = path.resolve(fixturePath);
    if (checkOnly) {
      assertFixtureSanitized(resolved);
      console.log(`OK ${resolved}`);
    } else {
      sanitizeFixtureFile(resolved);
    }
  }
}

const entryPoint = process.argv[1];
if (entryPoint && path.basename(entryPoint) === "sanitize-broker-fixture.ts") {
  runCli();
}
