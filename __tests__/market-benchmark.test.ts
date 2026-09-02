import {
  buildBenchmarkPeriods,
  computeBrokerReturnForRange,
  resolveComparisonDates,
} from "@/lib/market-benchmark";
import type { BrokerBalanceSnapshot } from "@/lib/portfolio-types";

function snapshot(
  periodEnd: string,
  brokerTotal: number,
  deposits: BrokerBalanceSnapshot["deposits"] = [],
): BrokerBalanceSnapshot {
  return {
    id: periodEnd,
    uploadedAt: `${periodEnd.slice(6, 10)}-${periodEnd.slice(3, 5)}-${periodEnd.slice(0, 2)}T12:00:00.000Z`,
    fileName: "report.html",
    periodStart: "01.01.2026",
    periodEnd,
    brokerTotal,
    customAssetsTotal: 0,
    totalDebt: 0,
    grandTotal: brokerTotal,
    deposits,
  };
}

describe("market benchmark periods", () => {
  const snapshots = [
    snapshot("31.01.2026", 1_000_000),
    snapshot("28.02.2026", 1_050_000),
    snapshot("31.03.2026", 1_080_000, [
      {
        id: "dep-mar",
        date: "15.03.2026",
        amount: 20_000,
        description: "Пополнение",
      },
    ]),
  ];

  it("builds monthly, ytd and all-time periods", () => {
    const periods = buildBenchmarkPeriods(snapshots);
    expect(periods.some((period) => period.kind === "month")).toBe(true);
    expect(periods.some((period) => period.id === "ytd-2026")).toBe(true);
    expect(periods.some((period) => period.id === "all")).toBe(true);
  });

  it("uses month-end to month-end range for monthly comparison", () => {
    const periods = buildBenchmarkPeriods(snapshots);
    const march = periods.find((period) => period.id === "month-2026-03");
    expect(march).toBeDefined();

    const range = resolveComparisonDates(march!);
    expect(range.fromDate).toBe("2026-02-28");
    expect(range.toDate).toBe("2026-03-31");
  });

  it("computes broker return excluding deposits in range", () => {
    const range = resolveComparisonDates({
      id: "month-2026-03",
      kind: "month",
      label: "март 2026",
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      calendarMonth: "2026-03",
    });

    const returnPct = computeBrokerReturnForRange(
      snapshots,
      range.fromDate,
      range.toDate,
    );

    // (1_080_000 - 1_050_000 - 20_000) / 1_050_000 * 100 ≈ 0.952%
    expect(returnPct).not.toBeNull();
    expect(returnPct!).toBeCloseTo(0.952, 2);
  });
});
