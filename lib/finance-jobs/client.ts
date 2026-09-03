import { toCivilDateString } from "../civil-date";
import type { MonteCarloResult } from "../compound-interest/monte-carlo";
import type { CompoundContext } from "../compound-interest/types";
import { chooseComputePlacement } from "../compute-placement";
import type { CompoundParams } from "../portfolio-types";
import { authenticatedFetch } from "../session-sync/transport";

export function isServerFinanceJobsEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_SERVER_FINANCE_JOBS === "1" ||
    process.env.VITE_SERVER_FINANCE_JOBS === "1"
  );
}

export function isHeavyComputeEntitled(): boolean {
  return (
    process.env.NEXT_PUBLIC_FINANCE_HEAVY === "1" ||
    process.env.VITE_FINANCE_HEAVY === "1"
  );
}

export function resolveMonteCarloPlacement(input: {
  simulations: number;
  years: number;
  online?: boolean;
  batterySaver?: boolean;
}): ReturnType<typeof chooseComputePlacement> {
  return chooseComputePlacement({
    kind: "monteCarlo",
    simulations: input.simulations,
    horizonMonths: Math.round(input.years * 12),
    online: input.online,
    batterySaver: input.batterySaver,
    serverJobsEnabled: isServerFinanceJobsEnabled(),
    heavyEntitled: isHeavyComputeEntitled(),
  });
}

export async function runServerMonteCarlo(input: {
  params: CompoundParams;
  context?: CompoundContext;
  simulations: number;
  volatilityPercent: number;
  seed: number;
  asOf: string;
  timeoutMs?: number;
}): Promise<MonteCarloResult> {
  const create = await authenticatedFetch("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "finance.evaluate",
      payload: {
        schemaVersion: 1,
        cases: [
          {
            operation: "monteCarlo",
            id: "ui",
            params: input.params,
            context: input.context,
            options: {
              simulations: input.simulations,
              volatilityPercent: input.volatilityPercent,
              seed: input.seed,
              asOf: toCivilDateString(input.asOf),
            },
          },
        ],
      },
    }),
  });
  if (!create.ok) {
    throw new Error(`finance.evaluate enqueue failed (${create.status})`);
  }
  const created = (await create.json()) as {
    id?: string;
    status?: string;
    result?: { cases?: Array<{ result?: MonteCarloResult }> };
  };
  if (created.status === "completed" && created.result?.cases?.[0]?.result) {
    return created.result.cases[0].result;
  }
  if (!created.id) {
    throw new Error("finance.evaluate job id missing");
  }
  return waitForMonteCarloJob(created.id, input.timeoutMs ?? 30_000);
}

async function waitForMonteCarloJob(
  jobId: string,
  timeoutMs: number,
): Promise<MonteCarloResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await authenticatedFetch(`/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`finance.evaluate poll failed (${response.status})`);
    }
    const body = (await response.json()) as {
      status?: string;
      result?: { cases?: Array<{ result?: MonteCarloResult }> };
      errorMessage?: string;
    };
    if (body.status === "completed" && body.result?.cases?.[0]?.result) {
      return body.result.cases[0].result;
    }
    if (body.status === "failed" || body.status === "cancelled") {
      throw new Error(body.errorMessage ?? `finance.evaluate ${body.status}`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error("finance.evaluate timed out");
}
