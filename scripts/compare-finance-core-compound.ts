import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { calculateCompoundInterest } from "../lib/compound-interest";
import { runMonteCarloSimulation } from "../lib/compound-interest/monte-carlo";
import type { CompoundParams } from "../lib/portfolio-types";
import type { CompoundContext } from "../lib/compound-interest/types";

type CompoundProjectionCase = {
  operation: "compoundProjection";
  id: string;
  params: CompoundParams;
  context?: CompoundContext;
  options?: {
    allMonths?: boolean;
    asOf?: string;
  };
};

type MonteCarloCase = {
  operation: "monteCarlo";
  id: string;
  params: CompoundParams;
  context?: CompoundContext;
  options?: {
    simulations?: number;
    volatilityPercent?: number;
    seed?: number;
    asOf?: string;
  };
};

type Fixture = {
  schemaVersion: 1;
  cases: Array<CompoundProjectionCase | MonteCarloCase>;
};

const fixturePath = resolve(
  process.argv[2] ?? "fixtures/finance-core/compound-v1.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;

const tsOutput = {
  schemaVersion: fixture.schemaVersion,
  cases: fixture.cases.map(evaluateTypeScript),
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
  `finance-core compound differential passed: ${fixture.cases.length} TS/Rust cases`,
);

function evaluateTypeScript(
  testCase: CompoundProjectionCase | MonteCarloCase,
): object {
  const asOf = testCase.options?.asOf
    ? parseLocalDate(testCase.options.asOf)
    : undefined;

  switch (testCase.operation) {
    case "compoundProjection": {
      const result = calculateCompoundInterest(
        testCase.params,
        testCase.context,
        {
          allMonths: testCase.options?.allMonths,
          asOf,
        },
      );
      return {
        operation: testCase.operation,
        id: testCase.id,
        result,
      };
    }
    case "monteCarlo": {
      const result = runMonteCarloSimulation(
        testCase.params,
        testCase.context,
        {
          simulations: testCase.options?.simulations,
          volatilityPercent: testCase.options?.volatilityPercent,
          seed: testCase.options?.seed,
          asOf,
        },
      );
      return {
        operation: testCase.operation,
        id: testCase.id,
        result,
      };
    }
  }
}

function parseLocalDate(iso: string): Date {
  const match = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid fixture date: ${iso}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function compareValues(expected: unknown, actual: unknown, path: string): void {
  if (typeof expected === "number" && typeof actual === "number") {
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
