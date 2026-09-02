import {
  RESILIENCE_WORKER_PROTOCOL_VERSION,
  isResilienceWorkerResponse,
  type ResilienceEvaluationResult,
  type ResilienceWorkerRequest,
} from "./resilience-contract";
import type { ResilienceInput } from "../resilience-plan";

export type { ResilienceEvaluationResult };

export interface ResilienceWorkerPort {
  postMessage(message: ResilienceWorkerRequest): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

export class ResilienceWorkerCancelledError extends Error {
  constructor() {
    super("Resilience worker calculation cancelled");
    this.name = "ResilienceWorkerCancelledError";
  }
}

export interface ResilienceWorkerJob {
  promise: Promise<ResilienceEvaluationResult>;
  cancel(): void;
}

export function startResilienceWorkerJob(
  worker: ResilienceWorkerPort,
  request: ResilienceWorkerRequest,
): ResilienceWorkerJob {
  let settled = false;
  let rejectJob: (error: Error) => void = () => {};

  const cleanup = () => {
    worker.removeEventListener("message", onMessage);
    worker.removeEventListener("error", onError);
    worker.terminate();
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    const candidate = event.data;
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "requestId" in candidate &&
      candidate.requestId !== request.requestId
    ) {
      return;
    }

    if (settled) return;
    settled = true;
    cleanup();

    if (!isResilienceWorkerResponse(candidate)) {
      rejectJob(new Error("Resilience worker returned an invalid response"));
      return;
    }

    if (candidate.type === "resilience.error") {
      rejectJob(new Error(candidate.error.message));
      return;
    }

    resolveJob(candidate.payload);
  };

  const onError = (event: ErrorEvent) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectJob(new Error(event.message || "Resilience worker failed"));
  };

  let resolveJob: (result: ResilienceEvaluationResult) => void = () => {};
  const promise = new Promise<ResilienceEvaluationResult>((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(request);
  });

  return {
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      rejectJob(new ResilienceWorkerCancelledError());
    },
  };
}

let nextRequestId = 0;

export function createResilienceWorkerRequest(
  input: ResilienceInput,
  options: { preferWasm: boolean; checkParity: boolean },
): ResilienceWorkerRequest {
  nextRequestId += 1;
  return {
    version: RESILIENCE_WORKER_PROTOCOL_VERSION,
    requestId: `resilience-${nextRequestId}`,
    type: "resilience.run",
    payload: {
      input,
      preferWasm: options.preferWasm,
      checkParity: options.checkParity,
    },
  };
}

export async function evaluateResiliencePlanDirect(
  input: ResilienceInput,
  options: { preferWasm: boolean; checkParity: boolean },
): Promise<ResilienceEvaluationResult> {
  const { evaluateResiliencePlanInWorker } = await import("./resilience-handler");
  return evaluateResiliencePlanInWorker(input, options);
}
