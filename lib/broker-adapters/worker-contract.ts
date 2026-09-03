import type { BrokerImportResult } from "./types";

export const BROKER_WORKER_PROTOCOL_VERSION = 1 as const;

export interface BrokerImportWorkerRequest {
  version: typeof BROKER_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "broker-import.run";
  payload: {
    content: string;
    fileName: string;
    mimeType?: string;
  };
}

export interface BrokerImportWorkerSuccess {
  version: typeof BROKER_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "broker-import.result";
  payload: BrokerImportResult;
}

export interface BrokerImportWorkerFailure {
  version: typeof BROKER_WORKER_PROTOCOL_VERSION;
  requestId: string;
  type: "broker-import.error";
  error: {
    code: "INVALID_REQUEST" | "PARSE_FAILED";
    message: string;
  };
}

export type BrokerWorkerRequest = BrokerImportWorkerRequest;
export type BrokerWorkerResponse =
  | BrokerImportWorkerSuccess
  | BrokerImportWorkerFailure;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isBrokerWorkerRequest(
  value: unknown,
): value is BrokerWorkerRequest {
  if (!isObject(value) || !isObject(value.payload)) return false;
  return (
    value.version === BROKER_WORKER_PROTOCOL_VERSION &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    value.type === "broker-import.run" &&
    typeof value.payload.content === "string" &&
    typeof value.payload.fileName === "string"
  );
}

export function isBrokerWorkerResponse(
  value: unknown,
): value is BrokerWorkerResponse {
  if (
    !isObject(value) ||
    value.version !== BROKER_WORKER_PROTOCOL_VERSION ||
    typeof value.requestId !== "string"
  ) {
    return false;
  }

  if (value.type === "broker-import.result") {
    return isObject(value.payload);
  }

  return (
    value.type === "broker-import.error" &&
    isObject(value.error) &&
    (value.error.code === "INVALID_REQUEST" ||
      value.error.code === "PARSE_FAILED") &&
    typeof value.error.message === "string"
  );
}
