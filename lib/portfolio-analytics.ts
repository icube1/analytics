import {
  getAssetCapitalGrowthPercent,
  getAssetIncomeReturnPercent,
  getAssetTotalReturnPercent,
  getCustomAssetsMonthlyIncome,
  getEnabledItems,
} from "./custom-assets";
import { ASSUMED_RETURNS } from "./portfolio-assumptions";
import type {
  BrokerReport,
  CompoundParams,
  CustomAssets,
} from "./portfolio-types";
import { getBrokerGoldRub, getTotalWealth } from "./portfolio-wealth";

export { ASSUMED_RETURNS };

export interface AllocationSlice {
  id: string;
  label: string;
  value: number;
  weight: number;
  /** Рост стоимости, % годовых */
  capitalReturn: number;
  /** Денежный доход, % годовых от стоимости */
  incomeReturn: number;
  assumedReturn: number;
  expectedReturnRub: number;
  note?: string;
  generatesDividendTax?: boolean;
}

export interface StockSlice {
  id: string;
  name: string;
  value: number;
  weightInPortfolio: number;
  weightInStocks: number;
}

export interface PortfolioAnalytics {
  grandTotal: number;
  slices: AllocationSlice[];
  stockSlices: StockSlice[];
  weightedReturn: number;
  expectedAnnualIncome: number;
  /** Пассивный денежный доход от пользовательских активов, ₽/мес */
  customMonthlyIncome: number;
  projectedValue1Y: number;
  projectedValue5Y: number;
  maxClassWeight: number;
  hhi: number;
  diversificationLabel: string;
  diversificationScore: number;
  brokerPeriodChange: number | null;
  brokerPeriodChangePct: number | null;
  activeClasses: number;
}

function buildSlices(
  wealth: ReturnType<typeof getTotalWealth>,
  assets: CustomAssets,
  inflationPercent: number,
): Omit<AllocationSlice, "weight" | "expectedReturnRub">[] {
  const items: Omit<AllocationSlice, "weight" | "expectedReturnRub">[] = [];

  if (wealth.brokerSecurities > 0) {
    items.push({
      id: "stocks",
      label: "Акции (брокер)",
      value: wealth.brokerSecurities,
      capitalReturn: ASSUMED_RETURNS.stocks,
      incomeReturn: 0,
      assumedReturn: ASSUMED_RETURNS.stocks,
      note: "Историческая доходность Мосбиржи",
      generatesDividendTax: true,
    });
  }

  if (wealth.brokerGoldRub > 0) {
    items.push({
      id: "broker-gold",
      label: "Золото (брокер)",
      value: wealth.brokerGoldRub,
      capitalReturn: ASSUMED_RETURNS.gold,
      incomeReturn: 0,
      assumedReturn: ASSUMED_RETURNS.gold,
      note: "GLD на брокерском счёте",
    });
  }

  if (wealth.brokerCashRub > 0) {
    items.push({
      id: "cash",
      label: "Денежные средства",
      value: wealth.brokerCashRub,
      capitalReturn: ASSUMED_RETURNS.cash,
      incomeReturn: 0,
      assumedReturn: ASSUMED_RETURNS.cash,
      note: "Ориентир: инфляция / депозит",
    });
  }

  for (const item of getEnabledItems(assets)) {
    const netValue = Math.max(0, item.value - item.debt);
    if (netValue <= 0) continue;

    const capitalReturn = getAssetCapitalGrowthPercent(item, inflationPercent);
    const incomeReturn = getAssetIncomeReturnPercent(item);
    const assumedReturn = capitalReturn + incomeReturn;
    const notes: string[] = [];
    if (item.growsWithInflation) {
      notes.push(`рост по инфляции (${inflationPercent}%)`);
    } else if (item.returnMode === "percent" && item.annualReturnPercent > 0) {
      notes.push(`рост ${item.annualReturnPercent}% годовых`);
    }
    if (item.returnMode === "income" && item.incomeAmount > 0) {
      const period = item.incomePeriod === "monthly" ? "мес." : "год";
      notes.push(`доход ${item.incomeAmount.toLocaleString("ru-RU")} ₽/${period}`);
    }

    items.push({
      id: item.id,
      label: item.label,
      value: netValue,
      capitalReturn,
      incomeReturn,
      assumedReturn,
      note: notes.length > 0 ? notes.join(" · ") : "Из настроек актива",
      generatesDividendTax: item.generatesDividendTax,
    });
  }

  return items;
}

/** Взвешенная доходность брокерского счёта (без пользовательских активов) */
export function getBrokerPoolReturn(
  report: BrokerReport | null,
  inflationPercent: number,
): number {
  const securities = report?.securitiesEnd ?? 0;
  const cash =
    report?.cash.find((c) => c.currency === "RUB")?.end ?? report?.cashEnd ?? 0;
  const gold = getBrokerGoldRub(report);

  const parts: { value: number; rate: number }[] = [];
  if (securities > 0) {
    parts.push({ value: securities, rate: ASSUMED_RETURNS.stocks });
  }
  if (gold > 0) {
    parts.push({ value: gold, rate: ASSUMED_RETURNS.gold });
  }
  if (cash > 0) {
    parts.push({ value: cash, rate: ASSUMED_RETURNS.cash });
  }

  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total <= 0) {
    return ASSUMED_RETURNS.stocks;
  }

  return parts.reduce((sum, part) => sum + part.value * part.rate, 0) / total;
}

function projectPortfolioValue(
  slices: AllocationSlice[],
  years: number,
): number {
  return slices.reduce(
    (sum, slice) =>
      sum + slice.value * (1 + slice.assumedReturn / 100) ** years,
    0,
  );
}

/** Доля акций и ЗПИФ в портфеле — на них начисляются дивиденды */
export function getTaxableAssetShare(analytics: PortfolioAnalytics): number {
  return analytics.slices
    .filter((slice) => slice.generatesDividendTax)
    .reduce((sum, slice) => sum + slice.weight, 0);
}

export function getTaxableAssetShareFromAssets(
  report: BrokerReport | null,
  assets: CustomAssets,
): number {
  const wealth = getTotalWealth(report, assets);
  const grandTotal = wealth.grandTotal || 1;

  let taxable = wealth.brokerSecurities / grandTotal;

  for (const item of getEnabledItems(assets)) {
    if (!item.generatesDividendTax) continue;
    taxable += Math.max(0, item.value - item.debt) / grandTotal;
  }

  return Math.min(1, taxable);
}

/** Значения калькулятора из текущего совокупного портфеля */
export function getCalculatorDefaultsFromPortfolio(
  analytics: PortfolioAnalytics,
  assets: CustomAssets,
  report: BrokerReport | null,
  inflationPercent = 6,
): Pick<
  CompoundParams,
  "initialCapital" | "annualReturnPercent" | "taxableAssetShare"
> {
  return {
    initialCapital: Math.round(analytics.grandTotal),
    annualReturnPercent:
      Math.round(getBrokerPoolReturn(report, inflationPercent) * 10) / 10,
    taxableAssetShare:
      Math.round(getTaxableAssetShareFromAssets(report, assets) * 1000) / 1000,
  };
}

export function computePortfolioAnalytics(
  report: BrokerReport | null,
  assets: CustomAssets,
  inflationPercent = 6,
): PortfolioAnalytics {
  const wealth = getTotalWealth(report, assets);
  const grandTotal = wealth.grandTotal || 1;

  const rawSlices = buildSlices(wealth, assets, inflationPercent);
  const slices: AllocationSlice[] = rawSlices.map((slice) => {
    const weight = slice.value / grandTotal;
    return {
      ...slice,
      weight,
      expectedReturnRub: slice.value * (slice.assumedReturn / 100),
    };
  });

  const weightedReturn = slices.reduce(
    (sum, s) => sum + s.weight * s.assumedReturn,
    0,
  );
  const expectedAnnualIncome = grandTotal * (weightedReturn / 100);

  const stockSlices: StockSlice[] = (report?.securities ?? [])
    .filter((s) => s.valueEnd > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      value: s.valueEnd,
      weightInPortfolio: s.valueEnd / grandTotal,
      weightInStocks: wealth.brokerSecurities
        ? s.valueEnd / wealth.brokerSecurities
        : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const hhi = slices.reduce((sum, s) => sum + s.weight ** 2, 0);
  const maxClassWeight = Math.max(...slices.map((s) => s.weight), 0);
  const activeClasses = slices.length;

  const n = Math.max(activeClasses, 1);
  const diversificationScore = Math.round(
    ((1 - hhi) / (1 - 1 / n)) * 100,
  );

  let diversificationLabel = "Высокая";
  if (diversificationScore < 40) diversificationLabel = "Низкая";
  else if (diversificationScore < 70) diversificationLabel = "Умеренная";

  const brokerStart = report?.assetsStart ?? 0;
  const brokerPeriodChange =
    report && brokerStart > 0 ? report.assetsEnd - brokerStart : null;
  const brokerPeriodChangePct =
    brokerPeriodChange !== null && brokerStart > 0
      ? (brokerPeriodChange / brokerStart) * 100
      : null;

  return {
    grandTotal,
    slices,
    stockSlices,
    weightedReturn,
    expectedAnnualIncome,
    customMonthlyIncome: getCustomAssetsMonthlyIncome(assets),
    projectedValue1Y: projectPortfolioValue(slices, 1),
    projectedValue5Y: projectPortfolioValue(slices, 5),
    maxClassWeight,
    hhi,
    diversificationLabel,
    diversificationScore,
    brokerPeriodChange,
    brokerPeriodChangePct,
    activeClasses,
  };
}
