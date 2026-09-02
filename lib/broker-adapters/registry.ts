import { manualCsvAdapter } from "./adapters/manual-csv";
import { sberHtmlAdapter } from "./adapters/sber-html";
import type { BrokerAdapter, BrokerAdapterId } from "./types";

/** Production adapters with real fixtures; planned IDs are documented only. */
export const BROKER_ADAPTERS: BrokerAdapter[] = [
  manualCsvAdapter,
  sberHtmlAdapter,
];

export const PLANNED_BROKER_ADAPTER_IDS: BrokerAdapterId[] = [
  "tbank-xlsx",
  "vtb-xls",
  "alfa-xml",
  "finam-xml",
  "bcs-xls",
];

export function getBrokerAdapter(id: BrokerAdapterId): BrokerAdapter | null {
  return BROKER_ADAPTERS.find((adapter) => adapter.id === id) ?? null;
}

export function listBrokerAdapters(): BrokerAdapter[] {
  return [...BROKER_ADAPTERS];
}
