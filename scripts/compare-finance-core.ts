import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { amortizeDebtMonth, estimatePayoffMonths } from "../lib/debt-amortization";
import {
  currentPaymentPeriodDays,
  simulationPaymentPeriodDays,
  surroundingPaymentDates,
} from "../lib/debt-daycount";

type DayCountCase = {
  operation: "dayCount";
  id: string;
  asOf: string;
  paymentDay: number;
  simulationMonths: number[];
};

type AmortizeCase = {
  operation: "amortize";
  id: string;
  balance: number;
  payment: number;
  annualInterestRate: number;
  periodDays?: number;
};

type EstimatePayoffCase = {
  operation: "estimatePayoff";
  id: string;
  balance: number;
  payment: number;
  annualInterestRate: number;
  paymentDay: number;
  asOf: string;
};

type Fixture = {
  schemaVersion: 1;
  cases: Array<DayCountCase | AmortizeCase | EstimatePayoffCase>;
};

const fixturePath = resolve(
  process.argv[2] ?? "fixtures/finance-core/v1.json",
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
  `finance-core differential passed: ${fixture.cases.length} TS/Rust cases`,
);

function evaluateTypeScript(
  testCase: DayCountCase | AmortizeCase | EstimatePayoffCase,
): object {
  switch (testCase.operation) {
    case "dayCount": {
      const asOf = parseLocalDate(testCase.asOf);
      const dates = surroundingPaymentDates(asOf, testCase.paymentDay);
      return {
        operation: testCase.operation,
        id: testCase.id,
        previous: formatLocalDate(dates.previous),
        next: formatLocalDate(dates.next),
        currentPeriodDays: currentPaymentPeriodDays(
          testCase.paymentDay,
          asOf,
        ),
        simulationPeriodDays: testCase.simulationMonths.map((month) =>
          simulationPaymentPeriodDays(asOf, month, testCase.paymentDay),
        ),
      };
    }
    case "amortize":
      return {
        operation: testCase.operation,
        id: testCase.id,
        ...amortizeDebtMonth(
          testCase.balance,
          testCase.payment,
          testCase.annualInterestRate,
          testCase.periodDays == null
            ? undefined
            : { periodDays: testCase.periodDays },
        ),
      };
    case "estimatePayoff":
      return {
        operation: testCase.operation,
        id: testCase.id,
        months: estimatePayoffMonths(
          testCase.balance,
          testCase.payment,
          testCase.annualInterestRate,
          testCase.paymentDay,
          parseLocalDate(testCase.asOf),
        ),
      };
  }
}

function parseLocalDate(iso: string): Date {
  const match = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid fixture date: ${iso}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
