import type {
  BrokerReport,
  BrokerTrade,
  CashPosition,
  SecurityPosition,
} from "./portfolio-types";

export interface ResolvedSecurityPosition {
  quantity: number;
  value: number;
  pendingQuantity: number;
  hasPendingSettlement: boolean;
}

export function resolveSecurityPosition(
  position: SecurityPosition,
): ResolvedSecurityPosition {
  const quantityPlanned = position.quantityPlanned;
  const hasPlanned =
    quantityPlanned != null &&
    quantityPlanned > 0 &&
    Math.abs(quantityPlanned - position.quantityEnd) > 0.0001;

  const quantity = hasPlanned ? quantityPlanned : position.quantityEnd;
  const value = quantity * position.priceEnd;
  const pendingQuantity = hasPlanned
    ? Math.max(0, quantityPlanned - position.quantityEnd)
    : 0;

  return {
    quantity,
    value,
    pendingQuantity,
    hasPendingSettlement: pendingQuantity > 0,
  };
}

export function getEffectiveSecurities(report: BrokerReport | null): SecurityPosition[] {
  if (!report) return [];

  return report.securities.map((position) => {
    const resolved = resolveSecurityPosition(position);
    return {
      ...position,
      quantityEnd: resolved.quantity,
      valueEnd: resolved.value,
    };
  });
}

export function sumEffectiveSecuritiesValue(report: BrokerReport | null): number {
  if (!report) return 0;
  return report.securities.reduce(
    (sum, position) => sum + resolveSecurityPosition(position).value,
    0,
  );
}

export interface ResolvedCashPosition {
  balance: number;
  pendingDebits: number;
  hasPendingSettlement: boolean;
}

export function resolveCashPosition(cash: CashPosition): ResolvedCashPosition {
  const endPlanned = cash.endPlanned;
  const hasPlanned =
    endPlanned != null &&
    endPlanned >= 0 &&
    Math.abs(endPlanned - cash.end) > 0.01;

  const balance = hasPlanned ? endPlanned : cash.end;
  const pendingDebits = hasPlanned
    ? Math.max(0, cash.end - endPlanned)
    : cash.plannedDebits ?? 0;

  return {
    balance,
    pendingDebits,
    hasPendingSettlement: hasPlanned && pendingDebits > 0.01,
  };
}

export function sumEffectiveCashRub(report: BrokerReport | null): number {
  if (!report) return 0;
  const rub = report.cash.find((item) => item.currency === "RUB");
  if (!rub) return report.cashEnd ?? 0;
  return resolveCashPosition(rub).balance;
}

export function getEffectivePortfolioTotals(report: BrokerReport): {
  securitiesEnd: number;
  cashEnd: number;
  assetsEnd: number;
} {
  const securitiesEnd = sumEffectiveSecuritiesValue(report);
  const cashEnd = sumEffectiveCashRub(report);
  return {
    securitiesEnd,
    cashEnd,
    assetsEnd: securitiesEnd + cashEnd,
  };
}

export function hasPendingCashSettlement(report: BrokerReport | null): boolean {
  if (!report) return false;
  return report.cash.some((item) => resolveCashPosition(item).hasPendingSettlement);
}

export function hasPendingSettlements(report: BrokerReport | null): boolean {
  if (!report) return false;
  return report.securities.some(
    (position) => resolveSecurityPosition(position).hasPendingSettlement,
  );
}

export function countPendingSettlementLots(report: BrokerReport | null): number {
  if (!report) return 0;
  return report.securities.reduce(
    (sum, position) => sum + resolveSecurityPosition(position).pendingQuantity,
    0,
  );
}

function parseRuDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

export function isUnsettledTrade(
  trade: BrokerTrade,
  periodEnd: string,
): boolean {
  if (!trade.settlementDate || !periodEnd) return false;
  const settlement = parseRuDate(trade.settlementDate);
  const period = parseRuDate(periodEnd);
  if (!settlement || !period) return false;
  return settlement.getTime() > period.getTime();
}

function tradeMatchesSecurity(trade: BrokerTrade, security: SecurityPosition): boolean {
  const tradeName = trade.name.trim().toLowerCase();
  const securityName = security.name.trim().toLowerCase();
  return tradeName === securityName;
}

function tradeQuantityDelta(trade: BrokerTrade): number {
  const side = trade.side.trim().toLowerCase();
  if (side.includes("покуп")) return trade.quantity;
  if (side.includes("прод")) return -trade.quantity;
  return 0;
}

function hasPlannedPositionData(report: BrokerReport): boolean {
  return report.securities.some((position) => {
    const planned = position.quantityPlanned ?? 0;
    return planned > 0 && Math.abs(planned - position.quantityEnd) > 0.0001;
  });
}

function tradeCashDelta(trade: BrokerTrade): number {
  const side = trade.side.trim().toLowerCase();
  const fees = trade.brokerFee + trade.exchangeFee;
  if (side.includes("покуп")) return -(trade.amount + fees);
  if (side.includes("прод")) return trade.amount - fees;
  return 0;
}

function hasPlannedCashData(report: BrokerReport): boolean {
  return report.cash.some((item) => {
    const planned = item.endPlanned;
    return planned != null && Math.abs(planned - item.end) > 0.01;
  });
}

function enrichCashFromTrades(report: BrokerReport): BrokerReport {
  if (hasPlannedCashData(report)) return report;

  let rubDelta = 0;
  for (const trade of report.trades) {
    if (!isUnsettledTrade(trade, report.periodEnd)) continue;
    rubDelta += tradeCashDelta(trade);
  }

  if (Math.abs(rubDelta) < 0.01) return report;

  const cash = report.cash.map((item) => {
    if (item.currency !== "RUB") return item;
    const endPlanned = Math.max(0, item.end + rubDelta);
    const plannedDebits = Math.max(0, item.end - endPlanned);
    return {
      ...item,
      endPlanned,
      plannedDebits: plannedDebits > 0 ? plannedDebits : item.plannedDebits,
    };
  });

  return { ...report, cash };
}

function enrichSecuritiesFromTrades(report: BrokerReport): BrokerReport {
  if (hasPlannedPositionData(report)) return report;
  if (report.trades.length === 0) return report;

  let changed = false;
  const securities = report.securities.map((security) => {
    let pendingDelta = 0;

    for (const trade of report.trades) {
      if (!isUnsettledTrade(trade, report.periodEnd)) continue;
      if (!tradeMatchesSecurity(trade, security)) continue;
      pendingDelta += tradeQuantityDelta(trade);
    }

    if (Math.abs(pendingDelta) < 0.0001) return security;

    changed = true;
    const quantityPlanned = security.quantityEnd + pendingDelta;
    return {
      ...security,
      quantityPlanned,
      plannedCredits:
        pendingDelta > 0 ? pendingDelta : security.plannedCredits ?? 0,
      plannedDebits:
        pendingDelta < 0 ? -pendingDelta : security.plannedDebits ?? 0,
    };
  });

  return changed ? { ...report, securities } : report;
}

/** Добавляет плановые остатки из нерасчитанных сделок T+1 для старых сохранённых отчётов */
export function enrichBrokerReport(report: BrokerReport | null): BrokerReport | null {
  if (!report) return null;
  return enrichCashFromTrades(enrichSecuritiesFromTrades(report));
}

export function brokerReportsEqual(
  left: BrokerReport | null,
  right: BrokerReport | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
