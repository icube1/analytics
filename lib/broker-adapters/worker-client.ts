import type { BrokerImportResult } from "./types";
import {
  BROKER_WORKER_PROTOCOL_VERSION,
  isBrokerWorkerResponse,
  type BrokerImportWorkerRequest,
} from "./worker-contract";

export interface BrokerWorkerPort {
  postMessage(message: BrokerImportWorkerRequest): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: "error",
    listener: (event: ErrorEvent) => void,
  ): void;
  terminate(): void;
}

export function createBrokerWorker(): BrokerWorkerPort {
  return new Worker(new URL("./broker.worker.ts", import.meta.url), {
    type: "module",
    name: "broker-import",
  });
}

let nextRequestId = 0;

export function createBrokerImportWorkerRequest(payload: {
  content: string;
  fileName: string;
  mimeType?: string;
}): BrokerImportWorkerRequest {
  nextRequestId += 1;
  return {
    version: BROKER_WORKER_PROTOCOL_VERSION,
    requestId: `broker-import-${nextRequestId}`,
    type: "broker-import.run",
    payload,
  };
}

export function importBrokerReportInWorker(payload: {
  content: string;
  fileName: string;
  mimeType?: string;
}): Promise<BrokerImportResult> {
  const worker = createBrokerWorker();
  const request = createBrokerImportWorkerRequest(payload);

  return new Promise((resolve, reject) => {
    let settled = false;
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

      if (!isBrokerWorkerResponse(candidate)) {
        reject(new Error("Broker worker returned an invalid response"));
        return;
      }
      if (candidate.type === "broker-import.error") {
        reject(new Error(candidate.error.message));
        return;
      }
      resolve(candidate.payload);
    };

    const onError = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message || "Broker worker failed"));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(request);
  });
}
