import type { CustomAssetItem, DepositInterestMode } from "./portfolio-types";

const MS_PER_DAY = 86_400_000;

export function isDepositItem(item: CustomAssetItem): boolean {
  return item.assetKind === "deposit";
}

function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function simulationDate(asOf: Date, simulationMonth: number): Date {
  return addCalendarMonths(asOf, simulationMonth);
}

export function getDepositMaturityDate(item: CustomAssetItem): Date | null {
  if (!isDepositItem(item) || !item.depositOpenedAt || !item.depositTermMonths) {
    return null;
  }
  const opened = parseLocalDate(item.depositOpenedAt);
  return addCalendarMonths(opened, item.depositTermMonths);
}

export function isDepositActive(item: CustomAssetItem, asOf: Date = new Date()): boolean {
  if (!isDepositItem(item) || !item.enabled || item.value <= 0) return false;
  const maturity = getDepositMaturityDate(item);
  if (!maturity) return true;
  const dayStart = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return dayStart < maturity;
}

export function getDepositMonthsRemaining(
  item: CustomAssetItem,
  asOf: Date = new Date(),
): number | null {
  const maturity = getDepositMaturityDate(item);
  if (!maturity) return null;
  const dayStart = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (dayStart >= maturity) return 0;
  const opened = item.depositOpenedAt
    ? parseLocalDate(item.depositOpenedAt)
    : dayStart;
  const totalDays = Math.max(1, Math.round((maturity.getTime() - opened.getTime()) / MS_PER_DAY));
  const remainingDays = Math.max(0, Math.round((maturity.getTime() - dayStart.getTime()) / MS_PER_DAY));
  return Math.max(0, Math.ceil((remainingDays / totalDays) * (item.depositTermMonths ?? 0)));
}

export function formatDepositMaturityDate(item: CustomAssetItem): string | null {
  const maturity = getDepositMaturityDate(item);
  if (!maturity) return null;
  return formatLocalDate(maturity);
}

export function depositMaturesInSimulationMonth(
  item: CustomAssetItem,
  asOf: Date,
  simulationMonth: number,
): boolean {
  const maturity = getDepositMaturityDate(item);
  if (!maturity) return false;
  const prev = simulationDate(asOf, simulationMonth - 1);
  const current = simulationDate(asOf, simulationMonth);
  const prevDay = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
  const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  return prevDay < maturity && currentDay >= maturity;
}

export function estimateDepositMaturityValue(
  principal: number,
  annualRatePercent: number,
  termMonths: number,
  mode: DepositInterestMode = "at_maturity",
  rateMethod: "effective" | "simple" = "simple",
): number {
  if (principal <= 0 || termMonths <= 0) return principal;
  const annualRate = annualRatePercent / 100;

  if (mode === "monthly_capitalized") {
    const monthlyRate =
      rateMethod === "simple"
        ? annualRate / 12
        : (1 + annualRate) ** (1 / 12) - 1;
    return principal * (1 + monthlyRate) ** termMonths;
  }

  return principal * (1 + annualRate * (termMonths / 12));
}

export function getDepositDisplayValue(
  item: CustomAssetItem,
  asOf: Date = new Date(),
): number {
  if (!isDepositItem(item) || !item.enabled) return 0;
  if (item.value <= 0) return 0;

  if (isDepositActive(item, asOf)) {
    if (item.depositInterestMode === "monthly_capitalized") {
      const opened = item.depositOpenedAt
        ? parseLocalDate(item.depositOpenedAt)
        : asOf;
      const maturity = getDepositMaturityDate(item);
      if (!maturity || !item.depositTermMonths) return item.value;

      const totalDays = Math.max(
        1,
        Math.round((maturity.getTime() - opened.getTime()) / MS_PER_DAY),
      );
      const elapsedDays = Math.max(
        0,
        Math.round(
          (Math.min(asOf.getTime(), maturity.getTime()) - opened.getTime()) /
            MS_PER_DAY,
        ),
      );
      const elapsedMonths = (elapsedDays / totalDays) * item.depositTermMonths;
      return estimateDepositMaturityValue(
        item.value,
        item.annualReturnPercent,
        elapsedMonths,
        "monthly_capitalized",
        "simple",
      );
    }
    return item.value;
  }

  const termMonths = item.depositTermMonths ?? 0;
  if (termMonths <= 0) return 0;
  return estimateDepositMaturityValue(
    item.value,
    item.annualReturnPercent,
    termMonths,
    item.depositInterestMode ?? "at_maturity",
    "simple",
  );
}
