import {
  DEFAULT_RESILIENCE_INPUT,
  ZERO_CAPITAL_RESILIENCE_INPUT,
  createSinkingFundGoal,
} from "./resilience-defaults";
import type { ResilienceInput } from "./resilience-plan";

export const RESILIENCE_STORAGE_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = "analytics.resilience-baseline.v1";

export interface ResilienceStorageDocument {
  schemaVersion: typeof RESILIENCE_STORAGE_SCHEMA_VERSION;
  savedAt: string;
  input: ResilienceInput;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isResilienceInput(value: unknown): value is ResilienceInput {
  if (!isObject(value)) return false;
  return (
    typeof value.mandatoryMonthlyExpenses === "number" &&
    typeof value.discretionaryMonthlyExpenses === "number" &&
    typeof value.liquidAssets === "number" &&
    typeof value.monthlySurplus === "number" &&
    typeof value.payCycleDays === "number" &&
    isObject(value.household) &&
    isObject(value.debt) &&
    Array.isArray(value.sinkingFunds) &&
    isObject(value.experiences)
  );
}

export function createDefaultResilienceDocument(): ResilienceStorageDocument {
  return {
    schemaVersion: RESILIENCE_STORAGE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    input: structuredClone(DEFAULT_RESILIENCE_INPUT),
  };
}

export function createZeroCapitalResilienceDocument(): ResilienceStorageDocument {
  return {
    schemaVersion: RESILIENCE_STORAGE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    input: structuredClone(ZERO_CAPITAL_RESILIENCE_INPUT),
  };
}

export function normalizeResilienceDocument(
  value: unknown,
): ResilienceStorageDocument {
  if (!isObject(value)) {
    return createDefaultResilienceDocument();
  }

  if (
    value.schemaVersion === RESILIENCE_STORAGE_SCHEMA_VERSION &&
    isResilienceInput(value.input)
  ) {
    return {
      schemaVersion: RESILIENCE_STORAGE_SCHEMA_VERSION,
      savedAt:
        typeof value.savedAt === "string"
          ? value.savedAt
          : new Date().toISOString(),
      input: {
        ...structuredClone(DEFAULT_RESILIENCE_INPUT),
        ...value.input,
        household: {
          ...DEFAULT_RESILIENCE_INPUT.household,
          ...(value.input.household as ResilienceInput["household"]),
        },
        debt: {
          ...DEFAULT_RESILIENCE_INPUT.debt,
          ...(value.input.debt as ResilienceInput["debt"]),
        },
        experiences: {
          ...DEFAULT_RESILIENCE_INPUT.experiences,
          ...(value.input.experiences as ResilienceInput["experiences"]),
        },
        sinkingFunds: value.input.sinkingFunds.map((goal) =>
          createSinkingFundGoal(goal as Parameters<typeof createSinkingFundGoal>[0]),
        ),
      },
    };
  }

  return createDefaultResilienceDocument();
}

export function readResilienceDocument(): ResilienceStorageDocument | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeResilienceDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeResilienceDocument(
  document: ResilienceStorageDocument,
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const payload: ResilienceStorageDocument = {
    ...document,
    schemaVersion: RESILIENCE_STORAGE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearResilienceDocument(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}
