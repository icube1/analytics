import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { calculateCompoundInterest } from "../lib/compound-interest";
import type { CompoundContext } from "../lib/compound-interest/types";
import type { CompoundParams } from "../lib/portfolio-types";
import { mapLiveForecastFromProjection } from "../lib/tracking-forecast";

type TrackingInput = {
  horizonMonths: number;
  currentGrandTotal: number;
  monthlyContribution: number;
  suggestedFromScenario: number;
  depositsByMonth?: Record<string, number>;
  withdrawCalendarMonth?: string | null;
  withdrawAfterYears?: number | null;
  basePlanId: string;
  basePlanName: string;
};

type LiveTrackingCase = {
  operation: "liveTrackingForecast";
  id: string;
  params: CompoundParams;
  context?: CompoundContext;
  options?: {
    asOf?: string;
    allMonths?: boolean;
  };
  tracking: TrackingInput;
};

type Fixture = {
  schemaVersion: 1;
  cases: LiveTrackingCase[];
};

const fixturePath = resolve(
  process.argv[2] ?? "fixtures/finance-core/live-tracking-v1.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;

const tsOutput = {
  schemaVersion: fixture.schemaVersion,
  cases: fixture.cases.map((testCase) => {
    const asOf = testCase.options?.asOf
      ? parseLocalDate(testCase.options.asOf)
      : undefined;
    const result = calculateCompoundInterest(
      testCase.params,
      testCase.context,
      { allMonths: true, asOf },
    );
    return {
      operation: testCase.operation,
      id: testCase.id,
      forecast: mapLiveForecastFromProjection({
        result,
        asOf: asOf ?? new Date(),
        horizonMonths: testCase.tracking.horizonMonths,
        currentGrandTotal: testCase.tracking.currentGrandTotal,
        monthlyContribution: testCase.tracking.monthlyContribution,
        suggestedFromScenario: testCase.tracking.suggestedFromScenario,
        depositsByMonth: new Map(
          Object.entries(testCase.tracking.depositsByMonth ?? {}),
        ),
        withdrawAfterYears: testCase.tracking.withdrawAfterYears ?? null,
        withdrawCalendarMonth: testCase.tracking.withdrawCalendarMonth ?? null,
        basePlanId: testCase.tracking.basePlanId,
        basePlanName: testCase.tracking.basePlanName,
      }),
    };
  }),
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
  `finance-core live-tracking differential passed: ${fixture.cases.length} TS/Rust cases`,
);

function parseLocalDate(iso: string): Date {
  const match = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid fixture date: ${iso}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function compareValues(expected: unknown, actual: unknown, path: string): void {
  if (typeof expected === "number" && typeof actual === "number") {
    const tolerance = 1e-8 * Math.max(1, Math.abs(expected));
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
