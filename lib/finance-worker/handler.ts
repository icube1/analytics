import { calculateCompoundInterest } from "../compound-interest";
import { runMonteCarloSimulation } from "../compound-interest/monte-carlo";
import {
  evaluateCompoundWithOptionalWasm,
  evaluateMonteCarloWithOptionalWasm,
} from "../compound-wasm";
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

function invalidRequest(
  requestId: string,
  message: string,
): FinanceWorkerResponse {
  return {
    version: FINANCE_WORKER_PROTOCOL_VERSION,
    requestId,
    type: "finance.error",
    error: {
      code: "INVALID_REQUEST",
      message,
    },
  };
}

export async function handleFinanceWorkerRequest(
  request: unknown,
): Promise<FinanceWorkerResponse> {
  const requestId = requestIdFrom(request);

  if (!isFinanceWorkerRequest(request)) {
    return invalidRequest(
      requestId,
      "Unsupported or malformed finance worker request",
    );
  }

  const asOf = new Date(request.payload.options.asOf);
  if (Number.isNaN(asOf.getTime())) {
    return invalidRequest(requestId, "asOf must be a valid ISO-8601 timestamp");
  }

  try {
    if (request.type === "compound-projection.run") {
      const evaluation = await evaluateCompoundWithOptionalWasm(
        () =>
          calculateCompoundInterest(request.payload.params, request.payload.context, {
            allMonths: request.payload.options.allMonths,
            asOf,
          }),
        request.payload.params,
        request.payload.context,
        {
          allMonths: request.payload.options.allMonths,
          asOf: request.payload.options.asOf,
          preferWasm: request.payload.options.preferWasm === true,
          checkParity: request.payload.options.checkParity === true,
        },
      );
      return {
        version: FINANCE_WORKER_PROTOCOL_VERSION,
        requestId,
        type: "compound-projection.result",
        payload: evaluation.result,
        engine: evaluation.engine,
        parityVerified: evaluation.parityVerified,
      };
    }

    const evaluation = await evaluateMonteCarloWithOptionalWasm(
      () =>
        runMonteCarloSimulation(request.payload.params, request.payload.context, {
          simulations: request.payload.options.simulations,
          volatilityPercent: request.payload.options.volatilityPercent,
          seed: request.payload.options.seed,
          asOf,
        }),
      request.payload.params,
      request.payload.context,
      {
        simulations: request.payload.options.simulations,
        volatilityPercent: request.payload.options.volatilityPercent,
        seed: request.payload.options.seed,
        asOf,
        preferWasm: request.payload.options.preferWasm === true,
        checkParity: request.payload.options.checkParity === true,
      },
    );
    return {
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "monte-carlo.result",
      payload: evaluation.result,
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
