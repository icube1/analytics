import { parseStandardTabularContent } from "../tabular-ledger";
import { parseTabularDocument } from "../tabular";
import type {
  BrokerAdapter,
  BrokerDetectionResult,
  BrokerImportInput,
} from "../types";

export const BCS_CSV_MAGIC = "# analytics-bcs-v1";

function detectBcs(input: BrokerImportInput): BrokerDetectionResult | null {
  const sample = input.content.slice(0, 32_768);
  const signals: string[] = [];
  let confidence = 0;

  if (sample.includes(BCS_CSV_MAGIC)) {
    signals.push("bcs-magic");
    confidence += 0.7;
  }
  if (/\bбкс\b|bcs broker|brokercredit/i.test(sample)) {
    signals.push("bcs-branding");
    confidence += 0.35;
  }
  if (/isin/i.test(sample) && /площадка|режим торгов/i.test(sample)) {
    signals.push("venue-isin");
    confidence += 0.2;
  }

  const document = parseTabularDocument(sample);
  if (document.sections.some((section) => section.name === "securities")) {
    signals.push("securities-section");
    confidence += 0.15;
  }

  if (confidence < 0.5) return null;
  return {
    adapterId: "bcs-xls",
    confidence: Math.min(1, confidence),
    signals,
  };
}

export const bcsTabularAdapter: BrokerAdapter = {
  id: "bcs-xls",
  version: "1.0.0",
  label: "BCS tabular CSV/XLS text",
  status: "production",
  supportedExtensions: [".csv", ".tsv", ".txt", ".xls", ".xlsx"],
  detect: detectBcs,
  parse: (input) => parseStandardTabularContent(input.content),
};
