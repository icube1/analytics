import { calculateCompoundInterest } from "../compound-interest";
import { runMonteCarloSimulation } from "../compound-interest/monte-carlo";
import { parseCivilDate } from "../civil-date";
import {
  evaluateCompoundWithOptionalWasm,
  evaluateLiveTrackingWithOptionalWasm,
  evaluateMonteCarloWithOptionalWasm,
  evaluateSafeWithdrawalWithOptionalWasm,
} from "../compound-wasm";
import { computeSafeWithdrawalAdvice } from "../safe-withdrawal";
import { mapLiveForecastFromProjection } from "../tracking-forecast";
import {
  FINANCE_WORKER_PROTOCOL_VERSION,
  isFinanceWorkerRequest,
  type FinanceWorkerResponse,
} from "./contract";

function parseWorkerAsOf(value: string): Date {
  return parseCivilDate(value);
}

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

  const asOf = parseWorkerAsOf(request.payload.options.asOf);
  if (Number.isNaN(asOf.getTime())) {
    return invalidRequest(requestId, "asOf must be a valid ISO-8601 timestamp");
  }

  try {
    if (request.type === "safe-withdrawal.run") {
      const evaluation = await evaluateSafeWithdrawalWithOptionalWasm(
        () =>
          computeSafeWithdrawalAdvice(
            request.payload.params,
            request.payload.context,
            { asOf },
          ),
        request.payload.params,
        request.payload.context,
        {
          asOf: request.payload.options.asOf,
          preferWasm: request.payload.options.preferWasm === true,
          checkParity: request.payload.options.checkParity === true,
        },
      );
      return {
        version: FINANCE_WORKER_PROTOCOL_VERSION,
        requestId,
        type: "safe-withdrawal.result",
        payload: evaluation.result,
        engine: evaluation.engine,
        parityVerified: evaluation.parityVerified,
      };
    }

    if (request.type === "live-tracking.run") {
      const evaluation = await evaluateLiveTrackingWithOptionalWasm(
        () => {
          const result = calculateCompoundInterest(
            request.payload.params,
            request.payload.context,
            { allMonths: true, asOf },
          );
          return mapLiveForecastFromProjection({
            result,
            asOf,
            horizonMonths: request.payload.tracking.horizonMonths,
            currentGrandTotal: request.payload.tracking.currentGrandTotal,
            monthlyContribution: request.payload.tracking.monthlyContribution,
            suggestedFromScenario: request.payload.tracking.suggestedFromScenario,
            depositsByMonth: new Map(
              Object.entries(request.payload.tracking.depositsByMonth),
            ),
            withdrawAfterYears: request.payload.tracking.withdrawAfterYears,
            withdrawCalendarMonth: request.payload.tracking.withdrawCalendarMonth,
            basePlanId: request.payload.tracking.basePlanId,
            basePlanName: request.payload.tracking.basePlanName,
          });
        },
        request.payload.params,
        request.payload.context,
        request.payload.tracking,
        {
          asOf: request.payload.options.asOf,
          preferWasm: request.payload.options.preferWasm === true,
          checkParity: request.payload.options.checkParity === true,
        },
      );
      return {
        version: FINANCE_WORKER_PROTOCOL_VERSION,
        requestId,
        type: "live-tracking.result",
        payload: evaluation.result,
        engine: evaluation.engine,
        parityVerified: evaluation.parityVerified,
      };
    }

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
