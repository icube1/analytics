"use client";

import { useEffect, useRef, useState } from "react";
import type { ResilienceInput } from "../resilience-plan";
import { createResilienceWorker } from "./resilience-browser-worker";
import {
  ResilienceWorkerCancelledError,
  createResilienceWorkerRequest,
  evaluateResiliencePlanDirect,
  startResilienceWorkerJob,
  type ResilienceEvaluationResult,
} from "./resilience-client";

interface UseResiliencePlanOptions {
  input: ResilienceInput;
  enabled?: boolean;
  preferWasm?: boolean;
  checkParity?: boolean;
  useWorker?: boolean;
}

interface ResiliencePlanState {
  result: ResilienceEvaluationResult | null;
  isLoading: boolean;
  error: string | null;
  isStale: boolean;
}

const IDLE_STATE: ResiliencePlanState = {
  result: null,
  isLoading: false,
  error: null,
  isStale: false,
};

function shouldCheckParity(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return process.env.NODE_ENV !== "production";
}

export function useResiliencePlan({
  input,
  enabled = true,
  preferWasm = true,
  checkParity,
  useWorker = true,
}: UseResiliencePlanOptions): ResiliencePlanState {
  const [state, setState] = useState<ResiliencePlanState>(IDLE_STATE);
  const parity = shouldCheckParity(checkParity);
  const requestGeneration = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    let cancelled = false;
    let cancelJob: (() => void) | null = null;

    const run = async () => {
      setState((current) => ({
        result: current.result,
        isLoading: true,
        error: null,
        isStale: true,
      }));

      try {
        let evaluation: ResilienceEvaluationResult;

        if (useWorker && typeof Worker !== "undefined") {
          let worker;
          try {
            worker = createResilienceWorker();
          } catch {
            worker = null;
          }

          if (worker) {
            const request = createResilienceWorkerRequest(input, {
              preferWasm,
              checkParity: parity,
            });
            const job = startResilienceWorkerJob(worker, request);
            cancelJob = () => job.cancel();
            evaluation = await job.promise;
          } else {
            evaluation = await evaluateResiliencePlanDirect(input, {
              preferWasm,
              checkParity: parity,
            });
          }
        } else {
          evaluation = await evaluateResiliencePlanDirect(input, {
            preferWasm,
            checkParity: parity,
          });
        }

        if (cancelled || generation !== requestGeneration.current) {
          return;
        }

        setState({
          result: evaluation,
          isLoading: false,
          error: null,
          isStale: false,
        });
      } catch (error) {
        if (
          cancelled ||
          generation !== requestGeneration.current ||
          error instanceof ResilienceWorkerCancelledError
        ) {
          return;
        }
        setState({
          result: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Не удалось рассчитать план устойчивости",
          isStale: false,
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelJob?.();
    };
  }, [enabled, input, preferWasm, parity, useWorker]);

  return enabled ? state : IDLE_STATE;
}
