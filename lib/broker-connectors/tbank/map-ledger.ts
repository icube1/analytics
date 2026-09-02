import { BROKER_IMPORT_LIMITS } from "../../broker-adapters/limits";
import { BROKER_CONNECTOR_LIMITS } from "../limits";
import { emptyLedger } from "../../broker-adapters/normalize";
import { reconcileBrokerLedger } from "../../broker-adapters/reconcile";
import type {
  BrokerImportCoverage,
  BrokerImportWarning,
  BrokerNormalizedLedger,
} from "../../broker-adapters/types";
import type { BrokerTrade, CashFlow } from "../../portfolio-types";
import { moneyValueToNumber, quotationToNumber } from "../decimal";
import type {
  InvestApiAccount,
  InvestApiBrokerReportRow,
  InvestApiOperation,
  InvestApiPortfolioResponse,
} from "../contracts/invest-api-v1";

export interface TbankLedgerMappingInput {
  account: InvestApiAccount;
  portfolio: InvestApiPortfolioResponse;
  operations: InvestApiOperation[];
  brokerReportRows: InvestApiBrokerReportRow[];
  periodStart: string;
  periodEnd: string;
  operationsTruncated: boolean;
  brokerReportTruncated: boolean;
}

export interface TbankLedgerMappingResult {
  ledger: BrokerNormalizedLedger;
  coverage: BrokerImportCoverage;
  warnings: BrokerImportWarning[];
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function isTradeOperation(type: string | undefined): boolean {
  if (!type) return false;
  return type.includes("BUY") || type.includes("SELL");
}

function mapSide(type: string | undefined, direction?: string): string {
  const source = direction ?? type ?? "";
  if (source.includes("BUY") || source.includes("Покупка")) return "Покупка";
  if (source.includes("SELL") || source.includes("Продажа")) return "Продажа";
  return source || "—";
}

function mapOperationsToTrades(operations: InvestApiOperation[]): BrokerTrade[] {
  const trades: BrokerTrade[] = [];

  for (const operation of operations) {
    if (!isTradeOperation(operation.type)) continue;

    const embeddedTrades = operation.trades ?? [];
    if (embeddedTrades.length > 0) {
      for (const trade of embeddedTrades) {
        const quantity = Number(trade.quantity ?? operation.quantity ?? 0);
        const price = moneyValueToNumber(trade.price ?? operation.price);
        const amount = Math.abs(moneyValueToNumber(operation.payment));
        trades.push({
          id: trade.tradeId ?? operation.id ?? `op-${trades.length}`,
          date: formatDate(trade.dateTime ?? operation.date),
          settlementDate: formatDate(operation.date),
          name: operation.figi ?? "—",
          ticker: operation.figi ?? "—",
          side: mapSide(operation.type),
          quantity: Math.abs(quantity),
          price,
          amount,
          brokerFee: 0,
          exchangeFee: 0,
        });
      }
      continue;
    }

    const quantity = Math.abs(Number(operation.quantity ?? 0));
    const price = moneyValueToNumber(operation.price);
    const amount = Math.abs(moneyValueToNumber(operation.payment));
    trades.push({
      id: operation.id ?? `op-${trades.length}`,
      date: formatDate(operation.date),
      settlementDate: formatDate(operation.date),
      name: operation.figi ?? "—",
      ticker: operation.figi ?? "—",
      side: mapSide(operation.type),
      quantity,
      price,
      amount,
      brokerFee: 0,
      exchangeFee: 0,
    });
  }

  return trades.slice(0, BROKER_IMPORT_LIMITS.maxTrades);
}

function mapBrokerReportToTrades(rows: InvestApiBrokerReportRow[]): BrokerTrade[] {
  const trades: BrokerTrade[] = [];

  for (const row of rows) {
    const quantity = Math.abs(Number(row.quantity ?? 0));
    const price = moneyValueToNumber(row.price);
    const amount = Math.abs(
      moneyValueToNumber(row.totalOrderAmount ?? row.orderAmount),
    );
    trades.push({
      id: row.tradeId ?? row.orderId ?? `br-${trades.length}`,
      date: formatDate(row.tradeDatetime),
      settlementDate: formatDate(row.secValueDate ?? row.clearValueDate),
      name: row.name ?? row.ticker ?? row.figi ?? "—",
      ticker: row.ticker ?? row.figi ?? "—",
      side: mapSide(undefined, row.direction),
      quantity,
      price,
      amount,
      brokerFee: Math.abs(moneyValueToNumber(row.brokerCommission)),
      exchangeFee: Math.abs(
        moneyValueToNumber(row.exchangeCommission) +
          moneyValueToNumber(row.exchangeClearingCommission),
      ),
    });
  }

  return trades.slice(0, BROKER_IMPORT_LIMITS.maxTrades);
}

function mapOperationsToCashFlows(operations: InvestApiOperation[]): CashFlow[] {
  const flows: CashFlow[] = [];

  for (const operation of operations) {
    if (isTradeOperation(operation.type)) continue;
    const payment = moneyValueToNumber(operation.payment);
    if (payment === 0) continue;

    flows.push({
      id: operation.id ?? `cf-${flows.length}`,
      date: formatDate(operation.date),
      description: operation.type ?? "operation",
      currency: operation.payment?.currency ?? operation.currency ?? "RUB",
      credit: payment > 0 ? payment : 0,
      debit: payment < 0 ? Math.abs(payment) : 0,
    });
  }

  return flows.slice(0, BROKER_IMPORT_LIMITS.maxCashFlows);
}

export function mapTbankApiToLedger(
  input: TbankLedgerMappingInput,
): TbankLedgerMappingResult {
  const warnings: BrokerImportWarning[] = [];
  const ledger = emptyLedger();

  ledger.periodStart = input.periodStart;
  ledger.periodEnd = input.periodEnd;
  ledger.createdAt = new Date().toISOString().slice(0, 10);
  ledger.investor = input.account.name ?? "T-Bank Invest";
  ledger.contract = input.account.id ?? "—";

  const securities = (input.portfolio.positions ?? [])
    .filter((position) => position.instrumentType !== "currency")
    .map((position, index) => {
      const quantityEnd = quotationToNumber(position.quantity);
      const priceEnd = moneyValueToNumber(position.currentPrice);
      const valueEnd = quantityEnd * priceEnd;

      return {
        id: position.figi ?? position.instrumentUid ?? `sec-${index}`,
        name: position.ticker ?? position.figi ?? "—",
        isin: position.figi ?? "",
        currency: position.currentPrice?.currency ?? "RUB",
        quantityStart: 0,
        quantityEnd,
        priceStart: 0,
        priceEnd,
        valueStart: 0,
        valueEnd,
        valueChange: 0,
      };
    })
    .slice(0, BROKER_IMPORT_LIMITS.maxSecurities);

  const cashRub = moneyValueToNumber(input.portfolio.totalAmountCurrencies);
  ledger.securities = securities;
  ledger.cash = cashRub
    ? [
        {
          platform: "T-Bank RUB",
          currency: "RUB",
          rateEnd: 1,
          start: 0,
          change: 0,
          end: cashRub,
        },
      ]
    : [];

  const operationTrades = mapOperationsToTrades(input.operations);
  const reportTrades = mapBrokerReportToTrades(input.brokerReportRows);
  ledger.trades = reportTrades.length > 0 ? reportTrades : operationTrades;
  ledger.cashFlows = mapOperationsToCashFlows(input.operations);

  ledger.securitiesEnd = moneyValueToNumber(input.portfolio.totalAmountShares) +
    moneyValueToNumber(input.portfolio.totalAmountBonds) +
    moneyValueToNumber(input.portfolio.totalAmountEtf);
  ledger.cashEnd = cashRub;
  ledger.assetsEnd = moneyValueToNumber(input.portfolio.totalAmountPortfolio);
  ledger.assetsChange = 0;

  if (input.operationsTruncated) {
    warnings.push({
      code: "PARTIAL_PARSE",
      message: `Operations truncated at ${BROKER_CONNECTOR_LIMITS.maxOperations} rows`,
    });
  }

  if (input.brokerReportTruncated) {
    warnings.push({
      code: "PARTIAL_PARSE",
      message: `Broker report truncated at ${BROKER_CONNECTOR_LIMITS.maxBrokerReportRows} rows`,
    });
  }

  if (reportTrades.length > 0 && operationTrades.length > 0) {
    warnings.push({
      code: "PARTIAL_PARSE",
      message: "Broker report trades preferred over operations list",
    });
  }

  const reconciliation = reconcileBrokerLedger(ledger);
  if (!reconciliation.withinTolerance) {
    warnings.push({
      code: "RECONCILIATION_MISMATCH",
      message: "Portfolio totals do not reconcile within tolerance",
    });
  }

  const coverage: BrokerImportCoverage = {
    meta: Boolean(input.account.id),
    rating: false,
    securities: securities.length > 0,
    cash: ledger.cash.length > 0,
    cashFlows: ledger.cashFlows.length > 0,
    trades: ledger.trades.length > 0,
    securitiesCount: securities.length,
    cashCount: ledger.cash.length,
    cashFlowCount: ledger.cashFlows.length,
    tradeCount: ledger.trades.length,
  };

  return { ledger, coverage, warnings };
}
