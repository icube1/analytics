import type { BrokerBalanceSnapshot, BrokerReport } from "./portfolio-types";
import { resolveSecurityPosition, sumEffectiveCashRub } from "./broker-positions";
import { formatMoney } from "./portfolio-wealth";

export interface SnapshotPosition {
  isin: string;
  name: string;
  quantity: number;
  value: number;
}

export interface BrokerReportDiffPosition {
  isin: string;
  name: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityDelta: number;
  valueBefore: number;
  valueAfter: number;
  valueDelta: number;
}

export interface BrokerReportDiff {
  previousPeriodEnd: string;
  currentPeriodEnd: string;
  previousFileName: string;
  currentFileName: string;
  brokerTotalBefore: number;
  brokerTotalAfter: number;
  brokerTotalDelta: number;
  cashBefore: number;
  cashAfter: number;
  cashDelta: number;
  securitiesValueBefore: number;
  securitiesValueAfter: number;
  securitiesValueDelta: number;
  depositsInPeriod: number;
  positionChanges: BrokerReportDiffPosition[];
}

export function snapshotPositionsFromReport(
  report: BrokerReport,
): SnapshotPosition[] {
  return report.securities
    .map((position) => {
      const resolved = resolveSecurityPosition(position);
      return {
        isin: position.isin,
        name: position.name,
        quantity: resolved.quantity,
        value: resolved.value,
      };
    })
    .filter((position) => position.quantity > 0 || position.value > 0)
    .sort((a, b) => a.isin.localeCompare(b.isin));
}

export function buildBrokerReportDiff(
  previous: BrokerBalanceSnapshot,
  current: BrokerBalanceSnapshot,
): BrokerReportDiff | null {
  const beforePositions = previous.securities ?? [];
  const afterPositions = current.securities ?? [];
  if (beforePositions.length === 0 || afterPositions.length === 0) {
    return null;
  }

  const beforeByIsin = new Map(beforePositions.map((p) => [p.isin, p]));
  const afterByIsin = new Map(afterPositions.map((p) => [p.isin, p]));
  const isins = new Set([...beforeByIsin.keys(), ...afterByIsin.keys()]);

  const positionChanges: BrokerReportDiffPosition[] = [];

  for (const isin of isins) {
    const before = beforeByIsin.get(isin);
    const after = afterByIsin.get(isin);
    const quantityBefore = before?.quantity ?? 0;
    const quantityAfter = after?.quantity ?? 0;
    const valueBefore = before?.value ?? 0;
    const valueAfter = after?.value ?? 0;
    const quantityDelta = quantityAfter - quantityBefore;
    const valueDelta = valueAfter - valueBefore;

    if (
      Math.abs(quantityDelta) < 0.0001 &&
      Math.abs(valueDelta) < 0.01
    ) {
      continue;
    }

    positionChanges.push({
      isin,
      name: after?.name ?? before?.name ?? isin,
      quantityBefore,
      quantityAfter,
      quantityDelta,
      valueBefore,
      valueAfter,
      valueDelta,
    });
  }

  positionChanges.sort(
    (a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta),
  );

  const cashBefore = previous.cashRub ?? 0;
  const cashAfter = current.cashRub ?? 0;
  const securitiesValueBefore = beforePositions.reduce(
    (sum, position) => sum + position.value,
    0,
  );
  const securitiesValueAfter = afterPositions.reduce(
    (sum, position) => sum + position.value,
    0,
  );

  const depositsInPeriod = current.deposits.reduce(
    (sum, deposit) => sum + deposit.amount,
    0,
  );

  return {
    previousPeriodEnd: previous.periodEnd,
    currentPeriodEnd: current.periodEnd,
    previousFileName: previous.fileName,
    currentFileName: current.fileName,
    brokerTotalBefore: previous.brokerTotal,
    brokerTotalAfter: current.brokerTotal,
    brokerTotalDelta: current.brokerTotal - previous.brokerTotal,
    cashBefore,
    cashAfter,
    cashDelta: cashAfter - cashBefore,
    securitiesValueBefore,
    securitiesValueAfter,
    securitiesValueDelta: securitiesValueAfter - securitiesValueBefore,
    depositsInPeriod,
    positionChanges,
  };
}

export function findLatestBrokerReportDiff(
  snapshots: BrokerBalanceSnapshot[],
): BrokerReportDiff | null {
  const withPositions = snapshots.filter(
    (snapshot) => (snapshot.securities?.length ?? 0) > 0,
  );
  if (withPositions.length < 2) return null;
  const current = withPositions[withPositions.length - 1];
  const previous = withPositions[withPositions.length - 2];
  return buildBrokerReportDiff(previous, current);
}

export function formatDiffDelta(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatMoney(Math.abs(value))}`;
}

export function effectiveBrokerTotalFromReport(report: BrokerReport): number {
  const securities = report.securities.reduce(
    (sum, position) => sum + resolveSecurityPosition(position).value,
    0,
  );
  return securities + sumEffectiveCashRub(report);
}
