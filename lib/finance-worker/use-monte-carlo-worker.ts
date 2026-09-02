"use client";

import { useEffect, useState } from "react";
import type { MonteCarloResult } from "../compound-interest/monte-carlo";
import type { CompoundContext } from "../compound-interest/types";
import type { CompoundParams } from "../portfolio-types";
import {
  createFinanceWorker,
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
      setState(IDLE_STATE);
      return;
    }

    let worker;
    try {
      worker = createFinanceWorker();
    } catch (error) {
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
      },
    });
    const job = startMonteCarloWorkerJob(worker, request);

    setState((current) => ({
      result: current.result,
      isLoading: true,
      error: null,
    }));

    void job.promise.then(
      (result) => setState({ result, isLoading: false, error: null }),
      (error: unknown) => {
        if (error instanceof FinanceWorkerCancelledError) return;
        setState({
          result: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Monte Carlo calculation failed",
        });
      },
    );

    return () => job.cancel();
  }, [
    enabled,
    params,
    context,
    simulations,
    volatilityPercent,
    seed,
    asOf,
  ]);

  return state;
}
