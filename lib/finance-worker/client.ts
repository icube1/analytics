import {
  FINANCE_WORKER_PROTOCOL_VERSION,
  isFinanceWorkerResponse,
  type CompoundProjectionWorkerRequest,
  type FinanceWorkerRequest,
  type MonteCarloWorkerRequest,
  type LiveTrackingWorkerRequest,
  type SafeWithdrawalWorkerRequest,
} from "./contract";
import type { MonteCarloResult } from "../compound-interest/monte-carlo";
import type { CompoundResult } from "../compound-interest/types";
import type { SafeWithdrawalAdvice } from "../safe-withdrawal";
import type { LiveForecastResult } from "../tracking-forecast";

export interface FinanceWorkerPort {
  postMessage(message: FinanceWorkerRequest): void;
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

export class FinanceWorkerCancelledError extends Error {
  constructor() {
    super("Finance worker calculation cancelled");
    this.name = "FinanceWorkerCancelledError";
  }
}

export interface FinanceWorkerJob {
  promise: Promise<MonteCarloResult>;
  cancel(): void;
}

export function startMonteCarloWorkerJob(
  worker: FinanceWorkerPort,
  request: MonteCarloWorkerRequest,
): FinanceWorkerJob {
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

    if (!isFinanceWorkerResponse(candidate)) {
      rejectJob(new Error("Finance worker returned an invalid response"));
    } else if (candidate.type === "finance.error") {
      rejectJob(new Error(candidate.error.message));
    } else if (candidate.type === "monte-carlo.result") {
      resolveJob(candidate.payload);
    } else {
      rejectJob(new Error("Finance worker returned a compound result for Monte Carlo"));
    }
  };

  const onError = (event: ErrorEvent) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectJob(new Error(event.message || "Finance worker failed"));
  };

  let resolveJob: (result: MonteCarloResult) => void = () => {};
  const promise = new Promise<MonteCarloResult>((resolve, reject) => {
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
      rejectJob(new FinanceWorkerCancelledError());
    },
  };
}

let nextRequestId = 0;

export function createMonteCarloWorkerRequest(
  payload: MonteCarloWorkerRequest["payload"],
): MonteCarloWorkerRequest {
  nextRequestId += 1;
  return {
    version: FINANCE_WORKER_PROTOCOL_VERSION,
    requestId: `monte-carlo-${nextRequestId}`,
    type: "monte-carlo.run",
    payload,
  };
}

export interface CompoundWorkerJob {
  promise: Promise<CompoundResult>;
  cancel(): void;
}

export function startCompoundWorkerJob(
  worker: FinanceWorkerPort,
  request: CompoundProjectionWorkerRequest,
): CompoundWorkerJob {
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

    if (!isFinanceWorkerResponse(candidate)) {
      rejectJob(new Error("Finance worker returned an invalid response"));
    } else if (candidate.type === "finance.error") {
      rejectJob(new Error(candidate.error.message));
    } else if (candidate.type === "compound-projection.result") {
      resolveJob(candidate.payload);
    } else {
      rejectJob(new Error("Finance worker returned a Monte Carlo result for compound"));
    }
  };

  const onError = (event: ErrorEvent) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectJob(new Error(event.message || "Finance worker failed"));
  };

  let resolveJob: (result: CompoundResult) => void = () => {};
  const promise = new Promise<CompoundResult>((resolve, reject) => {
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
      rejectJob(new FinanceWorkerCancelledError());
    },
  };
}

export function createCompoundWorkerRequest(
  payload: CompoundProjectionWorkerRequest["payload"],
): CompoundProjectionWorkerRequest {
  nextRequestId += 1;
  return {
    version: FINANCE_WORKER_PROTOCOL_VERSION,
    requestId: `compound-${nextRequestId}`,
    type: "compound-projection.run",
    payload,
  };
}

export interface SafeWithdrawalWorkerJob {
  promise: Promise<SafeWithdrawalAdvice | null>;
  cancel(): void;
}

export function startSafeWithdrawalWorkerJob(
  worker: FinanceWorkerPort,
  request: SafeWithdrawalWorkerRequest,
): SafeWithdrawalWorkerJob {
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

    if (!isFinanceWorkerResponse(candidate)) {
      rejectJob(new Error("Finance worker returned an invalid response"));
    } else if (candidate.type === "finance.error") {
      rejectJob(new Error(candidate.error.message));
    } else if (candidate.type === "safe-withdrawal.result") {
      resolveJob(candidate.payload);
    } else {
      rejectJob(new Error("Finance worker returned a different calculation for safe withdrawal"));
    }
  };

  const onError = (event: ErrorEvent) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectJob(new Error(event.message || "Finance worker failed"));
  };

  let resolveJob: (result: SafeWithdrawalAdvice | null) => void = () => {};
  const promise = new Promise<SafeWithdrawalAdvice | null>((resolve, reject) => {
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
      rejectJob(new FinanceWorkerCancelledError());
    },
  };
}

export function createSafeWithdrawalWorkerRequest(
  payload: SafeWithdrawalWorkerRequest["payload"],
): SafeWithdrawalWorkerRequest {
  nextRequestId += 1;
  return {
    version: FINANCE_WORKER_PROTOCOL_VERSION,
    requestId: `safe-withdrawal-${nextRequestId}`,
    type: "safe-withdrawal.run",
    payload,
  };
}

export interface LiveTrackingWorkerJob {
  promise: Promise<LiveForecastResult>;
  cancel(): void;
}

export function startLiveTrackingWorkerJob(
  worker: FinanceWorkerPort,
  request: LiveTrackingWorkerRequest,
): LiveTrackingWorkerJob {
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

    if (!isFinanceWorkerResponse(candidate)) {
      rejectJob(new Error("Finance worker returned an invalid response"));
    } else if (candidate.type === "finance.error") {
      rejectJob(new Error(candidate.error.message));
    } else if (candidate.type === "live-tracking.result") {
      resolveJob(candidate.payload);
    } else {
      rejectJob(new Error("Finance worker returned a different calculation for live tracking"));
    }
  };

  const onError = (event: ErrorEvent) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectJob(new Error(event.message || "Finance worker failed"));
  };

  let resolveJob: (result: LiveForecastResult) => void = () => {};
  const promise = new Promise<LiveForecastResult>((resolve, reject) => {
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
      rejectJob(new FinanceWorkerCancelledError());
    },
  };
}

export function createLiveTrackingWorkerRequest(
  payload: LiveTrackingWorkerRequest["payload"],
): LiveTrackingWorkerRequest {
  nextRequestId += 1;
  return {
    version: FINANCE_WORKER_PROTOCOL_VERSION,
    requestId: `live-tracking-${nextRequestId}`,
    type: "live-tracking.run",
    payload,
  };
}
