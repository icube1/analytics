import {
  FINANCE_WORKER_PROTOCOL_VERSION,
  isFinanceWorkerRequest,
  type MonteCarloWorkerRequest,
} from "@/lib/finance-worker/contract";
import { handleFinanceWorkerRequest } from "@/lib/finance-worker/handler";
import { DEFAULT_COMPOUND_PARAMS } from "@/lib/portfolio-types";

function request(
  overrides: Partial<MonteCarloWorkerRequest["payload"]["options"]> = {},
): MonteCarloWorkerRequest {
  return {
    version: FINANCE_WORKER_PROTOCOL_VERSION,
    requestId: "test-request",
    type: "monte-carlo.run",
    payload: {
      params: {
        ...DEFAULT_COMPOUND_PARAMS,
        initialCapital: 1_000_000,
        monthlyContribution: 50_000,
        annualReturnPercent: 10,
        years: 2,
      },
      options: {
        simulations: 50,
        volatilityPercent: 12,
        seed: 7,
        asOf: "2026-01-15T00:00:00.000Z",
        ...overrides,
      },
    },
  };
}

describe("finance worker protocol v1", () => {
  it("runs a deterministic request with explicit seed and asOf", async () => {
    const input = request();

    expect(isFinanceWorkerRequest(input)).toBe(true);
    const first = await handleFinanceWorkerRequest(input);
    const repeated = await handleFinanceWorkerRequest(input);

    expect(first).toEqual(repeated);
    expect(first.version).toBe(1);
    expect(first.requestId).toBe(input.requestId);
    expect(first.type).toBe("monte-carlo.result");
    if (first.type === "monte-carlo.result") {
      expect(first.payload.simulations).toBe(50);
      expect(first.payload.points).toHaveLength(25);
    }
  });

  it("rejects unsupported versions and invalid dates", async () => {
    const unsupported = {
      ...request(),
      version: 2,
    };
    const invalidDate = request({ asOf: "not-a-date" });

    expect(await handleFinanceWorkerRequest(unsupported)).toMatchObject({
      requestId: "test-request",
      type: "finance.error",
      error: { code: "INVALID_REQUEST" },
    });
    expect(await handleFinanceWorkerRequest(invalidDate)).toMatchObject({
      requestId: "test-request",
      type: "finance.error",
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("projects compound interest with an explicit asOf", async () => {
    const input = {
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId: "compound-test",
      type: "compound-projection.run" as const,
      payload: {
        params: {
          ...DEFAULT_COMPOUND_PARAMS,
          initialCapital: 100_000,
          monthlyContribution: 10_000,
          years: 1,
        },
        options: {
          asOf: "2026-01-15T00:00:00.000Z",
        },
      },
    };

    expect(isFinanceWorkerRequest(input)).toBe(true);
    const response = await handleFinanceWorkerRequest(input);
    expect(response.type).toBe("compound-projection.result");
    if (response.type === "compound-projection.result") {
      expect(response.payload.points.length).toBeGreaterThan(0);
      expect(response.engine).toBe("typescript");
    }
  });
});
