/** HTTP and pagination guardrails for broker API connectors. */
export const BROKER_CONNECTOR_LIMITS = {
  /** Per-request timeout (ms). */
  requestTimeoutMs: 15_000,
  /** Max retries for transient failures (429, 503, 504, network). */
  maxRetries: 3,
  /** Base backoff between retries (ms). */
  retryBaseDelayMs: 400,
  /** Minimum spacing between outbound API calls (ms). */
  minRequestIntervalMs: 120,
  /** Max operations fetched per sync. */
  maxOperations: 50_000,
  /** Max broker-report rows fetched per sync. */
  maxBrokerReportRows: 50_000,
  /** Default operations page size (API max 1000). */
  operationsPageSize: 250,
  /** Reconciliation tolerance reused from file adapters (RUB). */
  reconciliationToleranceRub: 1,
} as const;
