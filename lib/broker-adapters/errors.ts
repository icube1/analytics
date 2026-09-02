export const BrokerImportErrorCode = {
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  CONTENT_EMPTY: "CONTENT_EMPTY",
  NO_ADAPTER_MATCH: "NO_ADAPTER_MATCH",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  PARSE_FAILED: "PARSE_FAILED",
  ROW_LIMIT_EXCEEDED: "ROW_LIMIT_EXCEEDED",
  INVALID_NUMBER: "INVALID_NUMBER",
  RECOGNITION_FAILED: "RECOGNITION_FAILED",
} as const;

export type BrokerImportErrorCode =
  (typeof BrokerImportErrorCode)[keyof typeof BrokerImportErrorCode];

export interface BrokerImportError {
  code: BrokerImportErrorCode;
  message: string;
  path?: string;
  adapterId?: string;
}

export function brokerImportError(
  code: BrokerImportErrorCode,
  message: string,
  extra?: { path?: string; adapterId?: string },
): BrokerImportError {
  return { code, message, ...extra };
}
