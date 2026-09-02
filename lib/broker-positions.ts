import type { BrokerReport, BrokerTrade, SecurityPosition } from "./portfolio-types";

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

/** Добавляет плановые остатки из нерасчитанных сделок T+1 для старых сохранённых отчётов */
export function enrichBrokerReport(report: BrokerReport | null): BrokerReport | null {
  if (!report) return null;
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

export function brokerReportsEqual(
  left: BrokerReport | null,
  right: BrokerReport | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
