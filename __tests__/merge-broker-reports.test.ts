import {
  brokerAccountKey,
  combineBrokerReports,
  mergeSecurityPositions,
  normalizeBrokerAccounts,
  previewCombinedBrokerReport,
  upsertBrokerAccount,
} from "@/lib/merge-broker-reports";
import type { BrokerReport, SecurityPosition } from "@/lib/portfolio-types";

function position(
  partial: Partial<SecurityPosition> & Pick<SecurityPosition, "isin" | "name">,
): SecurityPosition {
  return {
    id: partial.id ?? partial.isin,
    name: partial.name,
    isin: partial.isin,
    currency: partial.currency ?? "RUB",
    quantityStart: partial.quantityStart ?? 0,
    quantityEnd: partial.quantityEnd ?? 0,
    priceStart: partial.priceStart ?? 0,
    priceEnd: partial.priceEnd ?? 0,
    valueStart: partial.valueStart ?? 0,
    valueEnd: partial.valueEnd ?? 0,
    valueChange: partial.valueChange ?? 0,
    quantityPlanned: partial.quantityPlanned,
    plannedCredits: partial.plannedCredits,
    plannedDebits: partial.plannedDebits,
  };
}

function report(
  partial: Partial<BrokerReport> & Pick<BrokerReport, "contract">,
): BrokerReport {
  return {
    periodStart: partial.periodStart ?? "01.09.2026",
    periodEnd: partial.periodEnd ?? "30.09.2026",
    createdAt: partial.createdAt ?? "30.09.2026",
    investor: partial.investor ?? "Инвестор",
    contract: partial.contract,
    assetsStart: partial.assetsStart ?? 0,
    assetsEnd: partial.assetsEnd ?? 0,
    assetsChange: partial.assetsChange ?? 0,
    securitiesStart: partial.securitiesStart ?? 0,
    securitiesEnd: partial.securitiesEnd ?? 0,
    cashStart: partial.cashStart ?? 0,
    cashEnd: partial.cashEnd ?? 0,
    securities: partial.securities ?? [],
    cash: partial.cash ?? [],
    trades: partial.trades ?? [],
    cashFlows: partial.cashFlows ?? [],
  };
}

describe("merge broker accounts", () => {
  const brokerage = report({
    contract: "12345",
    periodStart: "01.08.2026",
    periodEnd: "31.08.2026",
    assetsStart: 100_000,
    assetsEnd: 160_000,
    securitiesStart: 90_000,
    securitiesEnd: 150_000,
    cashStart: 10_000,
    cashEnd: 10_000,
    securities: [
      position({
        isin: "RU0009029540",
        name: "Сбербанк",
        quantityEnd: 10,
        priceEnd: 15_000,
        valueEnd: 150_000,
      }),
    ],
    cash: [
      {
        platform: "Торговый счет",
        currency: "RUB",
        rateEnd: 0,
        start: 10_000,
        change: 0,
        end: 10_000,
      },
    ],
  });

  const iis = report({
    contract: "IIS-9",
    periodStart: "15.09.2026",
    periodEnd: "30.09.2026",
    assetsStart: 40_000,
    assetsEnd: 75_000,
    securitiesStart: 40_000,
    securitiesEnd: 70_000,
    cashStart: 0,
    cashEnd: 5_000,
    securities: [
      position({
        isin: "RU0009029540",
        name: "Сбербанк",
        quantityEnd: 2,
        priceEnd: 15_000,
        valueEnd: 30_000,
      }),
      position({
        isin: "RU0007661625",
        name: "Газпром",
        quantityEnd: 10,
        priceEnd: 4_000,
        valueEnd: 40_000,
      }),
    ],
    cash: [
      {
        platform: "ИИС",
        currency: "RUB",
        rateEnd: 0,
        start: 0,
        change: 5_000,
        end: 5_000,
      },
    ],
  });

  it("keys accounts by contract so two portfolios stay distinct", () => {
    expect(brokerAccountKey(brokerage)).toBe("contract:12345");
    expect(brokerAccountKey(iis)).toBe("contract:iis-9");
  });

  it("sums the same ISIN across accounts and keeps unique names", () => {
    const merged = mergeSecurityPositions([
      ...brokerage.securities,
      ...iis.securities,
    ]);
    const sber = merged.find((item) => item.isin === "RU0009029540");
    const gazp = merged.find((item) => item.isin === "RU0007661625");
    expect(sber?.quantityEnd).toBe(12);
    expect(sber?.valueEnd).toBe(180_000);
    expect(gazp?.quantityEnd).toBe(10);
  });

  it("combines two different contracts into one totals view", () => {
    const combined = combineBrokerReports([brokerage, iis]);
    expect(combined?.contract).toBe("12345 + IIS-9");
    expect(combined?.assetsEnd).toBe(235_000);
    expect(combined?.cashEnd).toBe(15_000);
    expect(combined?.periodStart).toBe("01.08.2026");
    expect(combined?.periodEnd).toBe("30.09.2026");
    expect(combined?.cash).toHaveLength(1);
    expect(combined?.cash[0].end).toBe(15_000);
  });

  it("replaces an existing contract instead of duplicating it", () => {
    const first = upsertBrokerAccount([], brokerage, "broker.html");
    const updated = report({
      ...brokerage,
      assetsEnd: 200_000,
      cashEnd: 20_000,
    });
    const next = upsertBrokerAccount(first, updated, "broker-new.html");
    expect(next).toHaveLength(1);
    expect(next[0].report.assetsEnd).toBe(200_000);
    expect(next[0].fileName).toBe("broker-new.html");
  });

  it("adds a second contract instead of replacing the first", () => {
    const first = upsertBrokerAccount([], brokerage, "broker.html");
    const next = upsertBrokerAccount(first, iis, "iis.html");
    expect(next).toHaveLength(2);
    const preview = previewCombinedBrokerReport(first, iis, "iis.html");
    expect(preview?.assetsEnd).toBe(235_000);
  });

  it("seeds a legacy single brokerReport as one account", () => {
    const accounts = normalizeBrokerAccounts(undefined, brokerage, "old.html");
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe("contract:12345");
    expect(accounts[0].fileName).toBe("old.html");
  });

  it("keeps an explicit empty account list empty", () => {
    expect(normalizeBrokerAccounts([], brokerage, "old.html")).toEqual([]);
  });
});
