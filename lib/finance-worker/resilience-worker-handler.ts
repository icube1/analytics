import {
  RESILIENCE_WORKER_PROTOCOL_VERSION,
  isResilienceWorkerRequest,
  type ResilienceWorkerResponse,
} from "./resilience-contract";
import { evaluateResiliencePlanInWorker } from "./resilience-handler";

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

export async function handleResilienceWorkerRequest(
  request: unknown,
): Promise<ResilienceWorkerResponse> {
  const requestId = requestIdFrom(request);

  if (!isResilienceWorkerRequest(request)) {
    return {
      version: RESILIENCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "resilience.error",
      error: {
        code: "INVALID_REQUEST",
        message: "Unsupported or malformed resilience worker request",
      },
    };
  }

  try {
    const result = await evaluateResiliencePlanInWorker(
      request.payload.input,
      {
        preferWasm: request.payload.preferWasm,
        checkParity: request.payload.checkParity,
      },
    );
    return {
      version: RESILIENCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "resilience.result",
      payload: result,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Resilience calculation failed";
    return {
      version: RESILIENCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "resilience.error",
      error: {
        code: message.includes("diverged")
          ? "PARITY_MISMATCH"
          : "CALCULATION_FAILED",
        message,
      },
    };
  }
}
