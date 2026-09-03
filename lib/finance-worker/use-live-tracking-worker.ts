"use client";

import { useEffect, useState } from "react";
import type { CompoundContext } from "../compound-interest/types";
import type { CompoundParams } from "../portfolio-types";
import type { LiveForecastResult } from "../tracking-forecast";
import {
  isRustCompoundParityEnabled,
  shouldCheckCompoundParity,
} from "../compound-feature-flags";
import { createFinanceWorker } from "./browser-worker";
import {
  createLiveTrackingWorkerRequest,
  FinanceWorkerCancelledError,
  startLiveTrackingWorkerJob,
} from "./client";
import type { LiveTrackingWorkerInput } from "./contract";

interface UseLiveTrackingWorkerOptions {
  enabled?: boolean;
  params: CompoundParams;
  context: CompoundContext;
  asOf: string;
  tracking: LiveTrackingWorkerInput;
}

interface LiveTrackingWorkerState {
  result: LiveForecastResult | null;
  isLoading: boolean;
  error: string | null;
}

const IDLE_STATE: LiveTrackingWorkerState = {
  result: null,
  isLoading: false,
  error: null,
};

export function useLiveTrackingWorker({
  enabled = true,
  params,
  context,
  asOf,
  tracking,
}: UseLiveTrackingWorkerOptions): LiveTrackingWorkerState {
  const [state, setState] = useState<LiveTrackingWorkerState>(IDLE_STATE);

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

    const request = createLiveTrackingWorkerRequest({
      params,
      context,
      options: {
        asOf,
        preferWasm: isRustCompoundParityEnabled(),
        checkParity: shouldCheckCompoundParity(),
      },
      tracking,
    });
    const job = startLiveTrackingWorkerJob(worker, request);

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
              : "Live tracking forecast failed",
        }));
      },
    );

    return () => {
      active = false;
      job.cancel();
    };
  }, [enabled, params, context, asOf, tracking]);

  return state;
}
