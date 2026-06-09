import { getCustomAssetsTotal } from "./custom-assets";
import { getMonthlyDebtService, getTotalDebtBalance } from "./debt-amortization";
import type { BrokerReport, CustomAssets } from "./portfolio-types";
import { formatMoney } from "./stats";

export { formatMoney };

export function getBrokerGoldRub(report: BrokerReport | null): number {
  if (!report) return 0;
  const gld = report.cash.find((c) => c.currency === "GLD");
  if (!gld) return 0;
  return gld.end * (gld.rateEnd || 0);
}

export function getTotalWealth(
  report: BrokerReport | null,
  assets: CustomAssets,
): {
  brokerSecurities: number;
  brokerCashRub: number;
  brokerGoldRub: number;
  brokerTotal: number;
  customTotal: number;
  totalDebt: number;
  monthlyDebtService: number;
  grandTotal: number;
} {
  const brokerSecurities = report?.securitiesEnd ?? 0;
  const brokerCashRub =
    report?.cash.find((c) => c.currency === "RUB")?.end ?? report?.cashEnd ?? 0;
  const brokerGoldRub = getBrokerGoldRub(report);
  const brokerTotal = report?.assetsEnd ?? brokerSecurities + brokerCashRub + brokerGoldRub;

  const customTotal = getCustomAssetsTotal(assets);
  const totalDebt = getTotalDebtBalance(assets);
  const monthlyDebtService = getMonthlyDebtService(assets);

  return {
    brokerSecurities,
    brokerCashRub,
    brokerGoldRub,
    brokerTotal,
    customTotal,
    totalDebt,
    monthlyDebtService,
    grandTotal: brokerTotal + customTotal,
  };
}
