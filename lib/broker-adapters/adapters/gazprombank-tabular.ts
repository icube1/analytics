import { parseStandardTabularContent } from "../tabular-ledger";
import { parseTabularDocument } from "../tabular";
import type {
  BrokerAdapter,
  BrokerDetectionResult,
  BrokerImportInput,
} from "../types";

export const GAZPROMBANK_CSV_MAGIC = "# analytics-gazprombank-v1";

function detectGazprombank(
  input: BrokerImportInput,
): BrokerDetectionResult | null {
  const sample = input.content.slice(0, 32_768);
  const signals: string[] = [];
  let confidence = 0;

  if (sample.includes(GAZPROMBANK_CSV_MAGIC)) {
    signals.push("gazprombank-magic");
    confidence += 0.7;
  }
  if (/газпромбанк|gazprombank|\bgpb\b/i.test(sample)) {
    signals.push("gazprombank-branding");
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
    adapterId: "gazprombank-csv",
    confidence: Math.min(1, confidence),
    signals,
  };
}

export const gazprombankTabularAdapter: BrokerAdapter = {
  id: "gazprombank-csv",
  version: "1.0.0",
  label: "Gazprombank tabular CSV",
  status: "production",
  supportedExtensions: [".csv", ".tsv", ".txt"],
  detect: detectGazprombank,
  parse: (input) => parseStandardTabularContent(input.content),
};
