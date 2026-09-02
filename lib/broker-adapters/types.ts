import type { BrokerReport } from "../portfolio-types";

/** Stable adapter identifiers; production parsers require sanitized fixtures. */
export type BrokerAdapterId =
  | "sber-html-v1"
  | "manual-csv-v1"
  | "tbank-xlsx"
  | "vtb-xls"
  | "alfa-xml"
  | "finam-xml"
  | "bcs-xls";

export type BrokerAdapterStatus = "production" | "planned";

export interface BrokerImportInput {
  content: string;
  fileName?: string;
  mimeType?: string;
  /** When true, run HTML fixture sanitization before detection/parse. */
  sanitizeFixture?: boolean;
}

export interface BrokerDetectionResult {
  adapterId: BrokerAdapterId;
  confidence: number;
  signals: string[];
}

export interface BrokerImportProvenance {
  adapterId: BrokerAdapterId;
  adapterVersion: string;
  adapterLabel: string;
  fileName: string | null;
  mimeType: string | null;
  contentBytes: number;
  sanitized: boolean;
  detectedAt: string;
}

export interface BrokerImportCoverage {
  meta: boolean;
  rating: boolean;
  securities: boolean;
  cash: boolean;
  cashFlows: boolean;
  trades: boolean;
  securitiesCount: number;
  cashCount: number;
  cashFlowCount: number;
  tradeCount: number;
}

export type BrokerWarningCode =
  | "INVALID_NUMBER"
  | "SKIPPED_ROW"
  | "MISSING_TABLE"
  | "MISSING_META"
  | "RECONCILIATION_MISMATCH"
  | "PARTIAL_PARSE"
  | "SANITIZED_INPUT";

export interface BrokerImportWarning {
  code: BrokerWarningCode;
  message: string;
  path?: string;
  raw?: string;
}

export interface BrokerImportReconciliation {
  assetsEndReported: number | null;
  assetsEndComputed: number | null;
  securitiesEndReported: number | null;
  securitiesEndComputed: number | null;
  cashEndReported: number | null;
  cashEndComputed: number | null;
  assetsDelta: number | null;
  securitiesDelta: number | null;
  cashDelta: number | null;
  withinTolerance: boolean;
}

/** Normalized ledger is adapter-agnostic; maps 1:1 to BrokerReport fields. */
export interface BrokerNormalizedLedger {
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  investor: string;
  contract: string;
  assetsStart: number;
  assetsEnd: number;
  assetsChange: number;
  securitiesStart: number;
  securitiesEnd: number;
  cashStart: number;
  cashEnd: number;
  securities: BrokerReport["securities"];
  cash: BrokerReport["cash"];
  trades: BrokerReport["trades"];
  cashFlows: BrokerReport["cashFlows"];
}

export interface BrokerAdapterParseResult {
  ledger: BrokerNormalizedLedger;
  coverage: BrokerImportCoverage;
  warnings: BrokerImportWarning[];
  reconciliation: BrokerImportReconciliation;
}

export interface BrokerAdapter {
  readonly id: BrokerAdapterId;
  readonly version: string;
  readonly label: string;
  readonly status: BrokerAdapterStatus;
  readonly supportedExtensions: string[];
  detect(input: BrokerImportInput): BrokerDetectionResult | null;
  parse(input: BrokerImportInput): BrokerAdapterParseResult;
}

export interface BrokerImportResult {
  ok: boolean;
  report: BrokerReport | null;
  ledger: BrokerNormalizedLedger | null;
  provenance: BrokerImportProvenance;
  coverage: BrokerImportCoverage | null;
  warnings: BrokerImportWarning[];
  reconciliation: BrokerImportReconciliation | null;
  errors: import("./errors").BrokerImportError[];
  detection: BrokerDetectionResult[];
}
