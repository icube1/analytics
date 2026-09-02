import type { BrokerReport, SecurityPosition } from "./portfolio-types";

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
