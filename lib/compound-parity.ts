import type { CompoundResult } from "./compound-interest/types";
import type { MonteCarloResult } from "./compound-interest/monte-carlo";
import type { SafeWithdrawalAdvice } from "./safe-withdrawal";
import type { LiveForecastResult } from "./tracking-forecast";

const DEFAULT_TOLERANCE = 1e-10;

function numbersClose(
  expected: number,
  actual: number,
  tolerance: number,
): boolean {
  if (!Number.isFinite(expected) && !Number.isFinite(actual)) {
    return true;
  }
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    return false;
  }
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(expected - actual) <= tolerance * scale;
}

export function compareCompoundValues(
  expected: unknown,
  actual: unknown,
  path = "$",
  tolerance = DEFAULT_TOLERANCE,
): string[] {
  if (typeof expected === "number" && typeof actual === "number") {
    return numbersClose(expected, actual, tolerance)
      ? []
      : [`${path}: ${expected} != ${actual}`];
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return [`${path}: array lengths differ`];
    }
    return expected.flatMap((value, index) =>
      compareCompoundValues(
        value,
        actual[index],
        `${path}[${index}]`,
        tolerance,
      ),
    );
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
    const keyMismatches = compareCompoundValues(
      expectedKeys,
      actualKeys,
      `${path} keys`,
      tolerance,
    );
    return keyMismatches.concat(
      expectedKeys.flatMap((key) =>
        compareCompoundValues(
          expectedRecord[key],
          actualRecord[key],
          `${path}.${key}`,
          tolerance,
        ),
      ),
    );
  }

  return expected === actual ? [] : [`${path}: values differ`];
}

export function compoundResultsMatch(
  left: CompoundResult,
  right: CompoundResult,
  tolerance = DEFAULT_TOLERANCE,
): boolean {
  return compareCompoundValues(left, right, "$", tolerance).length === 0;
}

export function monteCarloResultsMatch(
  left: MonteCarloResult,
  right: MonteCarloResult,
  tolerance = DEFAULT_TOLERANCE,
): boolean {
  return compareCompoundValues(left, right, "$", tolerance).length === 0;
}

export function safeWithdrawalAdviceMatch(
  left: SafeWithdrawalAdvice | null,
  right: SafeWithdrawalAdvice | null,
  tolerance = DEFAULT_TOLERANCE,
): boolean {
  return compareCompoundValues(left, right, "$", tolerance).length === 0;
}

export function liveForecastResultsMatch(
  left: LiveForecastResult,
  right: LiveForecastResult,
  tolerance = DEFAULT_TOLERANCE,
): boolean {
  return compareCompoundValues(left, right, "$", tolerance).length === 0;
}

export const COMPOUND_PARITY_TOLERANCE = DEFAULT_TOLERANCE;
