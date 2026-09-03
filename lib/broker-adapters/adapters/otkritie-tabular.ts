import { parseStandardTabularContent } from "../tabular-ledger";
import { parseTabularDocument } from "../tabular";
import type {
  BrokerAdapter,
  BrokerDetectionResult,
  BrokerImportInput,
} from "../types";

export const OTKRITIE_CSV_MAGIC = "# analytics-otkritie-v1";

function detectOtkritie(input: BrokerImportInput): BrokerDetectionResult | null {
  const sample = input.content.slice(0, 32_768);
  const signals: string[] = [];
  let confidence = 0;

  if (sample.includes(OTKRITIE_CSV_MAGIC)) {
    signals.push("otkritie-magic");
    confidence += 0.7;
  }
  if (/открытие брокер|otkritie broker|\botkritie\b/i.test(sample)) {
    signals.push("otkritie-branding");
    confidence += 0.35;
  }
  if (/isin/i.test(sample) && /тикер|ticker/i.test(sample)) {
    signals.push("ticker-isin");
    confidence += 0.2;
  }

  const document = parseTabularDocument(sample);
  if (document.sections.some((section) => section.name === "securities")) {
    signals.push("securities-section");
    confidence += 0.15;
  }

  if (confidence < 0.5) return null;
  return {
    adapterId: "otkritie-csv",
    confidence: Math.min(1, confidence),
    signals,
  };
}

export const otkritieTabularAdapter: BrokerAdapter = {
  id: "otkritie-csv",
  version: "1.0.0",
  label: "Otkritie tabular CSV",
  status: "production",
  supportedExtensions: [".csv", ".tsv", ".txt"],
  detect: detectOtkritie,
  parse: (input) => parseStandardTabularContent(input.content),
};
