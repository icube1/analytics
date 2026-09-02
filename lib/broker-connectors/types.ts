import type {
  BrokerImportCoverage,
  BrokerImportProvenance,
  BrokerImportReconciliation,
  BrokerImportWarning,
  BrokerNormalizedLedger,
} from "../broker-adapters/types";

/** Stable connector identifiers; API connectors are separate from file adapters. */
export type BrokerConnectorId = "tbank-invest-api-v1";

export type BrokerConnectorStatus = "experimental" | "production";

export type BrokerConnectorEnvironment = "production" | "sandbox";

/**
 * Runtime credentials — never persisted, exported, or included in provenance.
 * Callers must supply the token on each sync invocation.
 */
export interface BrokerConnectorCredentials {
  token: string;
}

export interface BrokerConnectorSyncInput {
  connectorId: BrokerConnectorId;
  credentials: BrokerConnectorCredentials;
  /** Target brokerage account; when omitted the first open account is used. */
  accountId?: string;
  /** Inclusive period start (ISO date or date-time, UTC). */
  periodStart?: string;
  /** Inclusive period end (ISO date or date-time, UTC). */
  periodEnd?: string;
  environment?: BrokerConnectorEnvironment;
  /** Override fetch for tests; production callers should omit. */
  fetchImpl?: typeof fetch;
  /** Override REST base URL for contract tests. */
  baseUrl?: string;
}

export interface BrokerConnectorProvenance {
  connectorId: BrokerConnectorId;
  connectorVersion: string;
  connectorLabel: string;
  environment: BrokerConnectorEnvironment;
  accountId: string | null;
  apiContractVersion: string;
  syncedAt: string;
  /** Fixture-driven mock transport; never true against live API. */
  mockTransport: boolean;
}

export interface BrokerConnectorSyncResult {
  ok: boolean;
  ledger: BrokerNormalizedLedger | null;
  report: import("../portfolio-types").BrokerReport | null;
  provenance: BrokerConnectorProvenance;
  coverage: BrokerImportCoverage | null;
  warnings: BrokerImportWarning[];
  reconciliation: BrokerImportReconciliation | null;
  errors: import("./errors").BrokerConnectorError[];
}

export interface BrokerConnector {
  readonly id: BrokerConnectorId;
  readonly version: string;
  readonly label: string;
  readonly status: BrokerConnectorStatus;
  readonly apiContractVersion: string;
  sync(input: BrokerConnectorSyncInput): Promise<BrokerConnectorSyncResult>;
}

/** Re-export adapter-aligned types for connector consumers. */
export type {
  BrokerImportCoverage,
  BrokerImportProvenance,
  BrokerImportReconciliation,
  BrokerImportWarning,
  BrokerNormalizedLedger,
};
