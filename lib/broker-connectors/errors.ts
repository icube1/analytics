export const BrokerConnectorErrorCode = {
  FEATURE_DISABLED: "FEATURE_DISABLED",
  INVALID_TOKEN: "INVALID_TOKEN",
  NO_ACCOUNT: "NO_ACCOUNT",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  RATE_LIMITED: "RATE_LIMITED",
  API_ERROR: "API_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  RECOGNITION_FAILED: "RECOGNITION_FAILED",
  ROW_LIMIT_EXCEEDED: "ROW_LIMIT_EXCEEDED",
} as const;

export type BrokerConnectorErrorCode =
  (typeof BrokerConnectorErrorCode)[keyof typeof BrokerConnectorErrorCode];

export interface BrokerConnectorError {
  code: BrokerConnectorErrorCode;
  message: string;
  status?: number;
  details?: Record<string, string | number | boolean>;
}

export function brokerConnectorError(
  code: BrokerConnectorErrorCode,
  message: string,
  extra?: Partial<Omit<BrokerConnectorError, "code" | "message">>,
): BrokerConnectorError {
  return { code, message, ...extra };
}

/** Strip bearer tokens from error text before surfacing to callers. */
export function redactSecrets(text: string, token?: string): string {
  let redacted = text.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(/\bt\.[A-Za-z0-9_-]{8,}\b/g, "t.[REDACTED]");
  if (token && token.length > 4) {
    redacted = redacted.split(token).join("[REDACTED]");
  }
  return redacted;
}
