import { manualCsvAdapter } from "./adapters/manual-csv";
import { sberHtmlAdapter } from "./adapters/sber-html";
import { tbankTabularAdapter } from "./adapters/tbank-tabular";
import { vtbTabularAdapter } from "./adapters/vtb-tabular";
import { bcsTabularAdapter } from "./adapters/bcs-tabular";
import { gazprombankTabularAdapter } from "./adapters/gazprombank-tabular";
import { otkritieTabularAdapter } from "./adapters/otkritie-tabular";
import { alfaXmlAdapter, finamXmlAdapter } from "./adapters/xml-brokers";
import type { BrokerAdapter, BrokerAdapterId } from "./types";

/** Production adapters with sanitized fixtures in the repository. */
export const BROKER_ADAPTERS: BrokerAdapter[] = [
  manualCsvAdapter,
  sberHtmlAdapter,
  tbankTabularAdapter,
  vtbTabularAdapter,
  alfaXmlAdapter,
  finamXmlAdapter,
  bcsTabularAdapter,
  gazprombankTabularAdapter,
  otkritieTabularAdapter,
];

/** Formats that still need a live broker sample before a dedicated parser. */
export const PLANNED_BROKER_ADAPTER_IDS: BrokerAdapterId[] = [];

export function getBrokerAdapter(id: BrokerAdapterId): BrokerAdapter | null {
  return BROKER_ADAPTERS.find((adapter) => adapter.id === id) ?? null;
}

export function listBrokerAdapters(): BrokerAdapter[] {
  return [...BROKER_ADAPTERS];
}
