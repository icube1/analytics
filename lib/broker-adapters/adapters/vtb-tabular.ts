import { parseStandardTabularContent } from "../tabular-ledger";
import { parseTabularDocument } from "../tabular";
import type {
  BrokerAdapter,
  BrokerDetectionResult,
  BrokerImportInput,
} from "../types";

export const VTB_CSV_MAGIC = "# analytics-vtb-v1";

function detectVtb(input: BrokerImportInput): BrokerDetectionResult | null {
  const sample = input.content.slice(0, 32_768);
  const signals: string[] = [];
  let confidence = 0;

  if (sample.includes(VTB_CSV_MAGIC)) {
    signals.push("vtb-magic");
    confidence += 0.7;
  }
  if (/\bвтб\b|vtb broker/i.test(sample)) {
    signals.push("vtb-branding");
    confidence += 0.35;
  }
  if (/наименование/i.test(sample) && /isin/i.test(sample)) {
    signals.push("name-isin");
    confidence += 0.2;
  }

  const document = parseTabularDocument(sample);
  if (document.sections.some((section) => section.name === "securities")) {
    signals.push("securities-section");
    confidence += 0.15;
  }

  if (confidence < 0.5) return null;
  return {
    adapterId: "vtb-xls",
    confidence: Math.min(1, confidence),
    signals,
  };
}

export const vtbTabularAdapter: BrokerAdapter = {
  id: "vtb-xls",
  version: "1.0.0",
  label: "VTB tabular CSV/XLS text",
  status: "production",
  supportedExtensions: [".csv", ".tsv", ".txt", ".xls", ".xlsx"],
  detect: detectVtb,
  parse: (input) => parseStandardTabularContent(input.content),
};
