"use client";

import { useEffect, useState } from "react";
import type { MonteCarloResult } from "../compound-interest/monte-carlo";
import type { CompoundContext } from "../compound-interest/types";
import type { CompoundParams } from "../portfolio-types";
import { detectComputeEnvironment } from "../compute-placement";
import {
  isRustCompoundParityEnabled,
  shouldCheckCompoundParity,
} from "../compound-feature-flags";
import {
  resolveMonteCarloPlacement,
  runServerMonteCarlo,
} from "../finance-jobs/client";
import { createFinanceWorker } from "./browser-worker";
import {
  createMonteCarloWorkerRequest,
  FinanceWorkerCancelledError,
  startMonteCarloWorkerJob,
} from "./client";

interface UseMonteCarloWorkerOptions {
  enabled: boolean;
  params: CompoundParams;
  context: CompoundContext;
  simulations: number;
  volatilityPercent: number;
  seed: number;
  asOf: string;
}

interface MonteCarloWorkerState {
  result: MonteCarloResult | null;
  isLoading: boolean;
  error: string | null;
}

const IDLE_STATE: MonteCarloWorkerState = {
  result: null,
  isLoading: false,
  error: null,
};

export function useMonteCarloWorker({
  enabled,
  params,
  context,
  simulations,
  volatilityPercent,
  seed,
  asOf,
}: UseMonteCarloWorkerOptions): MonteCarloWorkerState {
  const [state, setState] = useState<MonteCarloWorkerState>(IDLE_STATE);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    let cancelWorker: (() => void) | undefined;
    const env = detectComputeEnvironment();
    const placement = resolveMonteCarloPlacement({
      simulations,
      years: params.years,
      online: env.online,
      batterySaver: env.batterySaver,
    });

    queueMicrotask(() => {
      if (!active) return;
      setState((current) => ({
        result: current.result,
        isLoading: true,
        error: null,
      }));
    });

    void (async () => {
      if (placement === "server-job") {
        try {
          const result = await runServerMonteCarlo({
            params,
            context,
            simulations,
            volatilityPercent,
            seed,
            asOf,
          });
          if (active) setState({ result, isLoading: false, error: null });
          return;
        } catch {
          // Fall back to the local Worker; production flags stay off.
        }
      }

      let worker;
      try {
        worker = createFinanceWorker();
      } catch (error) {
        if (!active) return;
        setState({
          result: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Web Worker is unavailable in this browser",
        });
        return;
      }

      const request = createMonteCarloWorkerRequest({
        params,
        context,
        options: {
          simulations,
          volatilityPercent,
          seed,
          asOf,
          preferWasm: isRustCompoundParityEnabled(),
          checkParity: shouldCheckCompoundParity(),
        },
      });
      const job = startMonteCarloWorkerJob(worker, request);
      cancelWorker = () => job.cancel();

      try {
        const result = await job.promise;
        if (active) setState({ result, isLoading: false, error: null });
      } catch (error: unknown) {
        if (!active || error instanceof FinanceWorkerCancelledError) return;
        setState({
          result: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Monte Carlo calculation failed",
        });
      }
    })();

    return () => {
      active = false;
      cancelWorker?.();
    };
  }, [
    enabled,
    params,
    context,
    simulations,
    volatilityPercent,
    seed,
    asOf,
  ]);

  return enabled ? state : IDLE_STATE;
}
