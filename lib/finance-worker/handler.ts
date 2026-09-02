import { runMonteCarloSimulation } from "../compound-interest/monte-carlo";
import {
  FINANCE_WORKER_PROTOCOL_VERSION,
  isFinanceWorkerRequest,
  type FinanceWorkerResponse,
} from "./contract";

function requestIdFrom(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    typeof value.requestId === "string"
  ) {
    return value.requestId;
  }
  return "unknown";
}

export function handleFinanceWorkerRequest(
  request: unknown,
): FinanceWorkerResponse {
  const requestId = requestIdFrom(request);

  if (!isFinanceWorkerRequest(request)) {
    return {
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "finance.error",
      error: {
        code: "INVALID_REQUEST",
        message: "Unsupported or malformed finance worker request",
      },
    };
  }

  const asOf = new Date(request.payload.options.asOf);
  if (Number.isNaN(asOf.getTime())) {
    return {
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "finance.error",
      error: {
        code: "INVALID_REQUEST",
        message: "Monte Carlo asOf must be a valid ISO-8601 timestamp",
      },
    };
  }

  try {
    const result = runMonteCarloSimulation(
      request.payload.params,
      request.payload.context,
      {
        ...request.payload.options,
        asOf,
      },
    );
    return {
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "monte-carlo.result",
      payload: result,
    };
  } catch (error) {
    return {
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "finance.error",
      error: {
        code: "CALCULATION_FAILED",
        message:
          error instanceof Error ? error.message : "Finance calculation failed",
      },
    };
  }
}
