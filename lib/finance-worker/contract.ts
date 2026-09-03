import type {
  MonteCarloResult,
} from "../compound-interest/monte-carlo";
import type { CompoundContext, CompoundResult } from "../compound-interest/types";
import type { CompoundParams } from "../portfolio-types";

export const FINANCE_WORKER_PROTOCOL_VERSION = 1 as const;

export interface MonteCarloWorkerOptions {
  simulations: number;
  volatilityPercent: number;
  seed: number;
  /** ISO-8601 timestamp; dates are never inferred inside the worker. */
  asOf: string;
  preferWasm?: boolean;
  checkParity?: boolean;
}

export interface CompoundProjectionWorkerOptions {
  /** ISO-8601 timestamp; dates are never inferred inside the worker. */
  asOf: string;
  allMonths?: boolean;
  preferWasm?: boolean;
  checkParity?: boolean;
}

export interface MonteCarloWorkerRequest {
  version: typeof FINANCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "monte-carlo.run";
  payload: {
    params: CompoundParams;
    context?: CompoundContext;
    options: MonteCarloWorkerOptions;
  };
}

export interface CompoundProjectionWorkerRequest {
  version: typeof FINANCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "compound-projection.run";
  payload: {
    params: CompoundParams;
    context?: CompoundContext;
    options: CompoundProjectionWorkerOptions;
  };
}

export type FinanceWorkerRequest =
  | MonteCarloWorkerRequest
  | CompoundProjectionWorkerRequest;

export interface MonteCarloWorkerSuccess {
  version: typeof FINANCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "monte-carlo.result";
  payload: MonteCarloResult;
}

export interface CompoundProjectionWorkerSuccess {
  version: typeof FINANCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "compound-projection.result";
  payload: CompoundResult;
  engine?: "typescript" | "wasm";
  parityVerified?: boolean | null;
}

export interface FinanceWorkerFailure {
  version: typeof FINANCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "finance.error";
  error: {
    code: "INVALID_REQUEST" | "CALCULATION_FAILED";
    message: string;
  };
}

export type FinanceWorkerResponse =
  | MonteCarloWorkerSuccess
  | CompoundProjectionWorkerSuccess
  | FinanceWorkerFailure;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isFinanceWorkerRequest(
  value: unknown,
): value is FinanceWorkerRequest {
  if (!isObject(value) || !isObject(value.payload)) return false;
  if (
    value.version !== FINANCE_WORKER_PROTOCOL_VERSION ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0 ||
    !isObject(value.payload.params)
  ) {
    return false;
  }

  const options = value.payload.options;
  if (!isObject(options) || typeof options.asOf !== "string") return false;

  if (value.type === "monte-carlo.run") {
    return (
      typeof options.simulations === "number" &&
      typeof options.volatilityPercent === "number" &&
      typeof options.seed === "number"
    );
  }

  return value.type === "compound-projection.run";
}

export function isFinanceWorkerResponse(
  value: unknown,
): value is FinanceWorkerResponse {
  if (
    !isObject(value) ||
    value.version !== FINANCE_WORKER_PROTOCOL_VERSION ||
    typeof value.requestId !== "string"
  ) {
    return false;
  }

  if (
    value.type === "monte-carlo.result" ||
    value.type === "compound-projection.result"
  ) {
    return isObject(value.payload);
  }

  return (
    value.type === "finance.error" &&
    isObject(value.error) &&
    (value.error.code === "INVALID_REQUEST" ||
      value.error.code === "CALCULATION_FAILED") &&
    typeof value.error.message === "string"
  );
}
