import type { ResilienceInput, ResiliencePlan } from "../resilience-plan";

export const RESILIENCE_WORKER_PROTOCOL_VERSION = 1 as const;

export type ResilienceEngine = "typescript" | "wasm";

export interface ResilienceEvaluationResult {
  plan: ResiliencePlan;
  engine: ResilienceEngine;
  parityVerified: boolean | null;
}

export interface ResilienceWorkerRequest {
  version: typeof RESILIENCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "resilience.run";
  payload: {
    input: ResilienceInput;
    preferWasm: boolean;
    checkParity: boolean;
  };
}

export interface ResilienceWorkerSuccess {
  version: typeof RESILIENCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "resilience.result";
  payload: ResilienceEvaluationResult;
}

export interface ResilienceWorkerFailure {
  version: typeof RESILIENCE_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "resilience.error";
  error: {
    code: "INVALID_REQUEST" | "CALCULATION_FAILED" | "PARITY_MISMATCH";
    message: string;
  };
}

export type ResilienceWorkerResponse =
  | ResilienceWorkerSuccess
  | ResilienceWorkerFailure;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isResilienceWorkerRequest(
  value: unknown,
): value is ResilienceWorkerRequest {
  return (
    isObject(value) &&
    value.version === RESILIENCE_WORKER_PROTOCOL_VERSION &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    value.type === "resilience.run" &&
    isObject(value.payload) &&
    isObject(value.payload.input)
  );
}

export function isResilienceWorkerResponse(
  value: unknown,
): value is ResilienceWorkerResponse {
  if (
    !isObject(value) ||
    value.version !== RESILIENCE_WORKER_PROTOCOL_VERSION ||
    typeof value.requestId !== "string"
  ) {
    return false;
  }

  if (value.type === "resilience.result") {
    return isObject(value.payload) && isObject(value.payload.plan);
  }

  return (
    value.type === "resilience.error" &&
    isObject(value.error) &&
    typeof value.error.message === "string"
  );
}
