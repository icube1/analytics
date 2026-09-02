"use client";

import { useEffect, useState } from "react";
import type { MonteCarloResult } from "../compound-interest/monte-carlo";
import type { CompoundContext } from "../compound-interest/types";
import type { CompoundParams } from "../portfolio-types";
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
    let worker;
    try {
      worker = createFinanceWorker();
    } catch (error) {
      queueMicrotask(() => {
        if (!active) return;
        setState({
          result: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Web Worker is unavailable in this browser",
        });
      });
      return () => {
        active = false;
      };
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

    queueMicrotask(() => {
      if (!active) return;
      setState((current) => ({
        result: current.result,
        isLoading: true,
        error: null,
      }));
    });

    void job.promise.then(
      (result) => {
        if (active) setState({ result, isLoading: false, error: null });
      },
      (error: unknown) => {
        if (!active || error instanceof FinanceWorkerCancelledError) return;
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

    return () => {
      active = false;
      job.cancel();
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
