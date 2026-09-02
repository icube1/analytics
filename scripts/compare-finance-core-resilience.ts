import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  evaluateResiliencePlan,
  type ResilienceInput,
} from "../lib/resilience-plan";

type ResilienceCase = {
  operation: "resiliencePlan";
  id: string;
  input: ResilienceInput;
};

type Fixture = {
  schemaVersion: 1;
  cases: ResilienceCase[];
};

const fixturePath = resolve(
  process.argv[2] ?? "fixtures/finance-core/resilience-v1.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;

const tsOutput = {
  schemaVersion: fixture.schemaVersion,
  cases: fixture.cases.map((testCase) => ({
    operation: testCase.operation,
    id: testCase.id,
    plan: evaluateResiliencePlan(testCase.input),
  })),
};

const rust = spawnSync(
  "cargo",
  [
    "run",
    "--quiet",
    "-p",
    "finance-core",
    "--bin",
    "finance-core-fixture",
    "--",
    fixturePath,
  ],
  { cwd: resolve("."), encoding: "utf8" },
);

if (rust.status !== 0) {
  throw new Error(
    `Rust fixture runner failed (${rust.status ?? "signal"}):\n${rust.stderr}`,
  );
}

const rustOutput: unknown = JSON.parse(rust.stdout);
compareValues(tsOutput, rustOutput, "$");
console.log(
  `finance-core resilience differential passed: ${fixture.cases.length} TS/Rust cases`,
);

function compareValues(expected: unknown, actual: unknown, path: string): void {
  if (typeof expected === "number" && typeof actual === "number") {
    if (!Number.isFinite(expected) && !Number.isFinite(actual)) {
      return;
    }
    const tolerance = 1e-10 * Math.max(1, Math.abs(expected));
    if (Math.abs(expected - actual) > tolerance) {
      throw new Error(`${path}: TS ${expected} != Rust ${actual}`);
    }
    return;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      throw new Error(`${path}: array lengths differ`);
    }
    expected.forEach((value, index) =>
      compareValues(value, actual[index], `${path}[${index}]`),
    );
    return;
  }

  if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const expectedKeys = Object.keys(expectedRecord).sort();
    const actualKeys = Object.keys(actualRecord).sort();
    compareValues(expectedKeys, actualKeys, `${path} keys`);
    for (const key of expectedKeys) {
      compareValues(
        expectedRecord[key],
        actualRecord[key],
        `${path}.${key}`,
      );
    }
    return;
  }

  if (expected !== actual) {
    throw new Error(
      `${path}: TS ${JSON.stringify(expected)} != Rust ${JSON.stringify(actual)}`,
    );
  }
}
