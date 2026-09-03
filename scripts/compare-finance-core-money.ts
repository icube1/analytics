import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  addMoney,
  amortizeMoney,
  interestMoney,
  roundMoney,
  type RoundingMode,
} from "../lib/money";

type MoneyRoundCase = {
  operation: "moneyRound";
  id: string;
  major: number;
  currency: string;
  mode?: RoundingMode;
};

type MoneyAddCase = {
  operation: "moneyAdd";
  id: string;
  leftMinor: number;
  rightMinor: number;
  currency: string;
};

type MoneyInterestCase = {
  operation: "moneyInterest";
  id: string;
  principalMinor: number;
  annualRatePercent: number;
  periodDays: number;
  yearDays?: number;
  currency: string;
  mode?: RoundingMode;
};

type MoneyAmortizeCase = {
  operation: "moneyAmortize";
  id: string;
  balanceMinor: number;
  paymentMinor: number;
  annualRatePercent: number;
  periodDays: number;
  yearDays?: number;
  currency: string;
  mode?: RoundingMode;
};

type Fixture = {
  schemaVersion: 1;
  cases: Array<MoneyRoundCase | MoneyAddCase | MoneyInterestCase | MoneyAmortizeCase>;
};

const fixturePath = resolve(
  process.argv[2] ?? "fixtures/finance-core/money-v1.json",
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
  `finance-core money differential passed: ${fixture.cases.length} TS/Rust cases`,
);

function evaluateTypeScript(
  testCase: Fixture["cases"][number],
): Record<string, unknown> {
  if (testCase.operation === "moneyRound") {
    const amount = roundMoney({
      major: testCase.major,
      currency: testCase.currency,
      mode: testCase.mode,
    });
    return {
      operation: "moneyRound",
      id: testCase.id,
      currency: amount.currency,
      minor: amount.minor,
      major: amount.major,
      exponent: amount.exponent,
      mode: testCase.mode ?? "halfAwayFromZero",
    };
  }
  if (testCase.operation === "moneyAdd") {
    const amount = addMoney({
      leftMinor: testCase.leftMinor,
      rightMinor: testCase.rightMinor,
      currency: testCase.currency,
    });
    return {
      operation: "moneyAdd",
      id: testCase.id,
      currency: amount.currency,
      minor: amount.minor,
      major: amount.major,
      exponent: amount.exponent,
    };
  }
  if (testCase.operation === "moneyAmortize") {
    const amount = amortizeMoney({
      balanceMinor: testCase.balanceMinor,
      paymentMinor: testCase.paymentMinor,
      annualRatePercent: testCase.annualRatePercent,
      periodDays: testCase.periodDays,
      yearDays: testCase.yearDays,
      currency: testCase.currency,
      mode: testCase.mode,
    });
    return {
      operation: "moneyAmortize",
      id: testCase.id,
      currency: amount.currency,
      exponent: amount.exponent,
      mode: testCase.mode ?? "halfAwayFromZero",
      balanceMinor: amount.balanceMinor,
      interestMinor: amount.interestMinor,
      principalMinor: amount.principalMinor,
      balanceMajor: amount.balanceMajor,
      interestMajor: amount.interestMajor,
      principalMajor: amount.principalMajor,
    };
  }
  const amount = interestMoney({
    principalMinor: testCase.principalMinor,
    annualRatePercent: testCase.annualRatePercent,
    periodDays: testCase.periodDays,
    yearDays: testCase.yearDays,
    currency: testCase.currency,
    mode: testCase.mode,
  });
  return {
    operation: "moneyInterest",
    id: testCase.id,
    currency: amount.currency,
    minor: amount.minor,
    major: amount.major,
    exponent: amount.exponent,
    mode: testCase.mode ?? "halfAwayFromZero",
  };
}

function compareValues(expected: unknown, actual: unknown, path: string): void {
  if (typeof expected === "number" && typeof actual === "number") {
    if (!Number.isFinite(expected) && !Number.isFinite(actual)) {
      return;
    }
    if (Number.isInteger(expected) && Number.isInteger(actual)) {
      if (expected !== actual) {
        throw new Error(`${path}: TS ${expected} != Rust ${actual}`);
      }
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
    expected &&
    actual &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const expectedKeys = Object.keys(expected as object).sort();
    const actualKeys = Object.keys(actual as object).sort();
    if (expectedKeys.join() !== actualKeys.join()) {
      throw new Error(
        `${path}: keys differ TS=${expectedKeys.join(",")} Rust=${actualKeys.join(",")}`,
      );
    }
    for (const key of expectedKeys) {
      compareValues(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
    return;
  }

  if (expected !== actual) {
    throw new Error(`${path}: TS ${String(expected)} != Rust ${String(actual)}`);
  }
}
