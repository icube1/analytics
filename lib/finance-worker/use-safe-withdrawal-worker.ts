"use client";

import { useEffect, useState } from "react";
import type { CompoundContext } from "../compound-interest/types";
import {
  isRustCompoundParityEnabled,
  shouldCheckCompoundParity,
} from "../compound-feature-flags";
import type { CompoundParams } from "../portfolio-types";
import type { SafeWithdrawalAdvice } from "../safe-withdrawal";
import { createFinanceWorker } from "./browser-worker";
import {
  createSafeWithdrawalWorkerRequest,
  FinanceWorkerCancelledError,
  startSafeWithdrawalWorkerJob,
} from "./client";

interface UseSafeWithdrawalWorkerOptions {
  params: CompoundParams;
  context: CompoundContext;
  asOf: string;
}

interface SafeWithdrawalWorkerState {
  result: SafeWithdrawalAdvice | null | undefined;
  isLoading: boolean;
  error: string | null;
}

const IDLE_STATE: SafeWithdrawalWorkerState = {
  result: undefined,
  isLoading: false,
  error: null,
};

export function useSafeWithdrawalWorker({
  params,
  context,
  asOf,
}: UseSafeWithdrawalWorkerOptions): SafeWithdrawalWorkerState {
  const [state, setState] = useState<SafeWithdrawalWorkerState>(IDLE_STATE);

  useEffect(() => {
    let active = true;
    let worker;
    try {
      worker = createFinanceWorker();
    } catch (error) {
      queueMicrotask(() => {
        if (!active) return;
        setState({
          result: undefined,
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

    const request = createSafeWithdrawalWorkerRequest({
      params,
      context,
      options: {
        asOf,
        preferWasm: isRustCompoundParityEnabled(),
        checkParity: shouldCheckCompoundParity(),
      },
    });
    const job = startSafeWithdrawalWorkerJob(worker, request);

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
        setState((current) => ({
          result: current.result,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Safe withdrawal calculation failed",
        }));
      },
    );

    return () => {
      active = false;
      job.cancel();
    };
  }, [params, context, asOf]);

  return state;
}
