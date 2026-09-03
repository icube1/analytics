"use client";

import { useEffect, useState } from "react";
import type { CompoundContext, CompoundResult } from "../compound-interest/types";
import {
  isRustCompoundParityEnabled,
  shouldCheckCompoundParity,
} from "../compound-feature-flags";
import type { CompoundParams } from "../portfolio-types";
import { createFinanceWorker } from "./browser-worker";
import {
  createCompoundWorkerRequest,
  FinanceWorkerCancelledError,
  startCompoundWorkerJob,
} from "./client";

interface UseCompoundWorkerOptions {
  params: CompoundParams;
  context: CompoundContext;
  asOf: string;
  allMonths?: boolean;
}

interface CompoundWorkerState {
  result: CompoundResult | null;
  isLoading: boolean;
  error: string | null;
}

const IDLE_STATE: CompoundWorkerState = {
  result: null,
  isLoading: false,
  error: null,
};

export function useCompoundWorker({
  params,
  context,
  asOf,
  allMonths,
}: UseCompoundWorkerOptions): CompoundWorkerState {
  const [state, setState] = useState<CompoundWorkerState>(IDLE_STATE);

  useEffect(() => {
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

    const request = createCompoundWorkerRequest({
      params,
      context,
      options: {
        asOf,
        allMonths,
        preferWasm: isRustCompoundParityEnabled(),
        checkParity: shouldCheckCompoundParity(),
      },
    });
    const job = startCompoundWorkerJob(worker, request);

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
              : "Compound projection failed",
        });
      },
    );

    return () => {
      active = false;
      job.cancel();
    };
  }, [params, context, asOf, allMonths]);

  return state;
}
