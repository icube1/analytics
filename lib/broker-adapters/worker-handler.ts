import { importUploadedBrokerFile } from "./upload";
import {
  BROKER_WORKER_PROTOCOL_VERSION,
  isBrokerWorkerRequest,
  type BrokerWorkerResponse,
} from "./worker-contract";

function requestIdFrom(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    typeof value.requestId === "string"
  ) {
    return value.requestId;
  }
  return "unknown";
}

export function handleBrokerWorkerRequest(request: unknown): BrokerWorkerResponse {
  const requestId = requestIdFrom(request);
  if (!isBrokerWorkerRequest(request)) {
    return {
      version: BROKER_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "broker-import.error",
      error: {
        code: "INVALID_REQUEST",
        message: "Unsupported or malformed broker worker request",
      },
    };
  }

  try {
    return {
      version: BROKER_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "broker-import.result",
      payload: importUploadedBrokerFile(
        request.payload.content,
        request.payload.fileName,
        request.payload.mimeType,
      ),
    };
  } catch (error) {
    return {
      version: BROKER_WORKER_PROTOCOL_VERSION,
      requestId,
      type: "broker-import.error",
      error: {
        code: "PARSE_FAILED",
        message:
          error instanceof Error ? error.message : "Broker import failed",
      },
    };
  }
}
