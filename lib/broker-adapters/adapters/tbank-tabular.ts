import { parseStandardTabularContent } from "../tabular-ledger";
import { parseTabularDocument } from "../tabular";
import type {
  BrokerAdapter,
  BrokerDetectionResult,
  BrokerImportInput,
} from "../types";

export const TBANK_CSV_MAGIC = "# analytics-tbank-v1";

function detectTbank(input: BrokerImportInput): BrokerDetectionResult | null {
  const sample = input.content.slice(0, 32_768);
  const signals: string[] = [];
  let confidence = 0;

  if (sample.includes(TBANK_CSV_MAGIC)) {
    signals.push("tbank-magic");
    confidence += 0.7;
  }
  if (/т-?банк|t-?bank|тинькофф инвест/i.test(sample)) {
    signals.push("tbank-branding");
    confidence += 0.35;
  }
  if (/isin/i.test(sample) && /тикер|ticker/i.test(sample)) {
    signals.push("ticker-isin");
    confidence += 0.2;
  }
  if (/дата заключения|дата сделки/i.test(sample)) {
    signals.push("trade-dates");
    confidence += 0.15;
  }

  const document = parseTabularDocument(sample);
  if (document.sections.some((section) => section.name === "securities")) {
    signals.push("securities-section");
    confidence += 0.15;
  }

  if (confidence < 0.5) return null;
  return {
    adapterId: "tbank-xlsx",
    confidence: Math.min(1, confidence),
    signals,
  };
}

export const tbankTabularAdapter: BrokerAdapter = {
  id: "tbank-xlsx",
  version: "1.0.0",
  label: "T-Bank tabular CSV",
  status: "production",
  supportedExtensions: [".csv", ".tsv", ".txt", ".xlsx"],
  detect: detectTbank,
  parse: (input) => parseStandardTabularContent(input.content),
};
