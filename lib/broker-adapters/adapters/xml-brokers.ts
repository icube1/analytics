import { BROKER_IMPORT_LIMITS } from "../limits";
import { emptyLedger } from "../normalize";
import {
  isValidParsedNumber,
  parseBrokerNumberOrWarn,
} from "../numbers";
import { reconcileBrokerLedger } from "../reconcile";
import {
  firstXmlText,
  xmlAttr,
  xmlElements,
  xmlRootName,
} from "../xml";
import type {
  BrokerAdapter,
  BrokerAdapterParseResult,
  BrokerDetectionResult,
  BrokerImportInput,
  BrokerImportWarning,
} from "../types";

function xmlNumber(
  fragment: string,
  tags: string[],
  path: string,
  warnings: BrokerImportWarning[],
): number {
  const raw = firstXmlText(fragment, tags) || xmlAttr(fragment, tags[0] ?? "");
  if (!raw) return 0;
  const parsed = parseBrokerNumberOrWarn(raw, path, warnings);
  return isValidParsedNumber(parsed) ? parsed.value : 0;
}

function parseBrokerXml(input: BrokerImportInput): BrokerAdapterParseResult {
  const warnings: BrokerImportWarning[] = [];
  const ledger = emptyLedger();
  const xml = input.content;
  const metaInner = xmlElements(xml, "meta")[0] ?? xml;
  ledger.periodStart =
    xmlAttr(metaInner, "periodStart") ||
    firstXmlText(metaInner, ["periodStart", "period_start", "from"]);
  ledger.periodEnd =
    xmlAttr(metaInner, "periodEnd") ||
    firstXmlText(metaInner, ["periodEnd", "period_end", "to"]);
  ledger.createdAt =
    xmlAttr(metaInner, "createdAt") ||
    firstXmlText(metaInner, ["createdAt", "created_at"]);
  ledger.investor =
    xmlAttr(metaInner, "investor") || firstXmlText(metaInner, ["investor"]);
  ledger.contract =
    xmlAttr(metaInner, "contract") ||
    firstXmlText(metaInner, ["contract", "account"]);

  const securityNodes = [
    ...xmlElements(xml, "security"),
    ...xmlElements(xml, "position"),
  ];
  ledger.securities = securityNodes.map((node, index) => {
    const path = `securities[${index}]`;
    const isin = firstXmlText(node, ["isin"]) || xmlAttr(node, "isin");
    const quantityEnd = xmlNumber(
      node,
      ["quantityEnd", "quantity", "qty"],
      `${path}.quantityEnd`,
      warnings,
    );
    const priceEnd = xmlNumber(node, ["priceEnd", "price"], `${path}.priceEnd`, warnings);
    const valueEnd = xmlNumber(node, ["valueEnd", "value"], `${path}.valueEnd`, warnings);
    return {
      id: isin || `sec-${index + 1}`,
      name:
        firstXmlText(node, ["name", "title"]) ||
        xmlAttr(node, "name") ||
        isin,
      isin: isin || `SYNTH-${index + 1}`,
      currency: firstXmlText(node, ["currency"]) || xmlAttr(node, "currency") || "RUB",
      quantityStart: xmlNumber(
        node,
        ["quantityStart"],
        `${path}.quantityStart`,
        warnings,
      ),
      quantityEnd,
      priceStart: xmlNumber(node, ["priceStart"], `${path}.priceStart`, warnings),
      priceEnd,
      valueStart: xmlNumber(node, ["valueStart"], `${path}.valueStart`, warnings),
      valueEnd: valueEnd || quantityEnd * priceEnd,
      valueChange: xmlNumber(node, ["valueChange"], `${path}.valueChange`, warnings),
    };
  });

  ledger.cash = xmlElements(xml, "cash").map((node, index) => {
    const path = `cash[${index}]`;
    return {
      platform:
        firstXmlText(node, ["platform"]) || xmlAttr(node, "platform") || "RUB",
      currency:
        firstXmlText(node, ["currency"]) || xmlAttr(node, "currency") || "RUB",
      rateEnd: xmlNumber(node, ["rateEnd", "rate"], `${path}.rateEnd`, warnings) || 1,
      start: xmlNumber(node, ["start"], `${path}.start`, warnings),
      change: xmlNumber(node, ["change"], `${path}.change`, warnings),
      end: xmlNumber(node, ["end", "balance"], `${path}.end`, warnings),
    };
  });

  ledger.cashFlows = xmlElements(xml, "cashFlow").map((node, index) => ({
    id: `cf-${index + 1}`,
    date: firstXmlText(node, ["date"]) || xmlAttr(node, "date"),
    description: firstXmlText(node, ["description"]) || xmlAttr(node, "description"),
    currency: firstXmlText(node, ["currency"]) || xmlAttr(node, "currency") || "RUB",
    credit: xmlNumber(node, ["credit"], `cash_flows[${index}].credit`, warnings),
    debit: xmlNumber(node, ["debit"], `cash_flows[${index}].debit`, warnings),
  }));

  ledger.trades = xmlElements(xml, "trade").map((node, index) => ({
    id: `tr-${index + 1}`,
    date: firstXmlText(node, ["date"]) || xmlAttr(node, "date"),
    settlementDate:
      firstXmlText(node, ["settlementDate"]) || xmlAttr(node, "settlementDate"),
    name: firstXmlText(node, ["name"]) || xmlAttr(node, "name"),
    ticker: firstXmlText(node, ["ticker"]) || xmlAttr(node, "ticker"),
    side: firstXmlText(node, ["side"]) || xmlAttr(node, "side"),
    quantity: xmlNumber(node, ["quantity"], `trades[${index}].quantity`, warnings),
    price: xmlNumber(node, ["price"], `trades[${index}].price`, warnings),
    amount: xmlNumber(node, ["amount"], `trades[${index}].amount`, warnings),
    brokerFee: xmlNumber(node, ["brokerFee", "fee"], `trades[${index}].brokerFee`, warnings),
    exchangeFee: xmlNumber(
      node,
      ["exchangeFee"],
      `trades[${index}].exchangeFee`,
      warnings,
    ),
  }));

  if (ledger.securities.length > BROKER_IMPORT_LIMITS.maxSecurities) {
    throw new Error("ROW_LIMIT_EXCEEDED:securities");
  }

  ledger.assetsChange = ledger.assetsEnd - ledger.assetsStart;

  const reconciliation = reconcileBrokerLedger(ledger);
  return {
    ledger,
    coverage: {
      meta: Boolean(ledger.periodStart && ledger.periodEnd),
      rating: ledger.assetsEnd > 0,
      securities: ledger.securities.length > 0,
      cash: ledger.cash.length > 0,
      cashFlows: ledger.cashFlows.length > 0,
      trades: ledger.trades.length > 0,
      securitiesCount: ledger.securities.length,
      cashCount: ledger.cash.length,
      cashFlowCount: ledger.cashFlows.length,
      tradeCount: ledger.trades.length,
    },
    warnings,
    reconciliation,
  };
}

function detectXmlBroker(
  input: BrokerImportInput,
  adapterId: "alfa-xml" | "finam-xml",
  roots: string[],
  brands: RegExp,
): BrokerDetectionResult | null {
  const sample = input.content.slice(0, 32_768);
  if (!/<[?]xml|<[a-z_]/i.test(sample)) return null;

  const signals: string[] = [];
  let confidence = 0;
  const root = xmlRootName(sample);
  if (roots.includes(root)) {
    signals.push("xml-root");
    confidence += 0.7;
  }
  if (brands.test(sample)) {
    signals.push("broker-branding");
    confidence += 0.3;
  }
  if (/<security[\s>]|<position[\s>]/i.test(sample) && /isin/i.test(sample)) {
    signals.push("security-isin");
    confidence += 0.2;
  }
  if (confidence < 0.5) return null;
  return { adapterId, confidence: Math.min(1, confidence), signals };
}

export const alfaXmlAdapter: BrokerAdapter = {
  id: "alfa-xml",
  version: "1.0.0",
  label: "Alfa-Investments XML",
  status: "production",
  supportedExtensions: [".xml"],
  detect: (input) =>
    detectXmlBroker(input, "alfa-xml", ["alfa_broker_report", "broker_report"], /альфа|alfa-invest/i),
  parse: (input) => parseBrokerXml(input),
};

export const finamXmlAdapter: BrokerAdapter = {
  id: "finam-xml",
  version: "1.0.0",
  label: "Finam XML",
  status: "production",
  supportedExtensions: [".xml"],
  detect: (input) =>
    detectXmlBroker(input, "finam-xml", ["finam_broker_report"], /финам|finam/i),
  parse: (input) => parseBrokerXml(input),
};
