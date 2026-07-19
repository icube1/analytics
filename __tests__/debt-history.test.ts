import {
  appendDebtBalanceIfChanged,
  appendDebtFromAssets,
  backfillDebtHistoryFromSnapshots,
  collectDebtObservations,
  debtPrincipalPaidByMonth,
} from "@/lib/debt-history";
import type { BrokerBalanceSnapshot, CustomAssets } from "@/lib/portfolio-types";

const assets = (debt: number): CustomAssets => ({
  items: [
    {
      id: "apt",
      enabled: true,
      label: "Квартира",
      value: 3_000_000,
      debt,
      monthlyDebtPayment: 55_000,
      debtAnnualRate: 10,
      growsWithInflation: false,
      returnMode: "none",
      annualReturnPercent: 0,
      incomeAmount: 0,
      incomePeriod: "monthly",
      generatesDividendTax: false,
      notes: "",
    },
  ],
  otherDebts: [],
});

describe("debt-history", () => {
  it("appends only when debt changes", () => {
    let history = appendDebtFromAssets([], assets(2_000_000), "2026-07-01T00:00:00.000Z");
    expect(history).toHaveLength(1);

    history = appendDebtFromAssets(history, assets(2_000_000), "2026-07-02T00:00:00.000Z");
    expect(history).toHaveLength(1);

    history = appendDebtFromAssets(history, assets(1_980_000), "2026-07-15T00:00:00.000Z");
    expect(history).toHaveLength(2);
    expect(history[1].totalDebt).toBe(1_980_000);
  });

  it("backfills from snapshots skipping zero debt", () => {
    const snapshots: BrokerBalanceSnapshot[] = [
      {
        id: "a",
        uploadedAt: "2026-06-10T00:00:00.000Z",
        fileName: "a.html",
        periodStart: "01.06.2026",
        periodEnd: "10.06.2026",
        brokerTotal: 100_000,
        customAssetsTotal: 1_000_000,
        totalDebt: 0,
        grandTotal: 1_100_000,
        deposits: [],
      },
      {
        id: "b",
        uploadedAt: "2026-07-10T00:00:00.000Z",
        fileName: "b.html",
        periodStart: "01.07.2026",
        periodEnd: "10.07.2026",
        brokerTotal: 120_000,
        customAssetsTotal: 1_000_000,
        totalDebt: 2_000_000,
        grandTotal: 1_120_000,
        deposits: [],
      },
    ];

    const history = backfillDebtHistoryFromSnapshots([], snapshots);
    expect(history).toHaveLength(1);
    expect(history[0].totalDebt).toBe(2_000_000);
    expect(history[0].source).toBe("backfill");
  });

  it("attributes principal to the month of the newer observation", () => {
    const observations = collectDebtObservations(
      [
        {
          id: "1",
          recordedAt: "2026-06-15T00:00:00.000Z",
          totalDebt: 2_000_000,
          source: "assets",
        },
        {
          id: "2",
          recordedAt: "2026-07-15T00:00:00.000Z",
          totalDebt: 1_960_000,
          source: "assets",
        },
      ],
      [],
      1_960_000,
      "2026-07",
      "2026-07-19T00:00:00.000Z",
    );

    const byMonth = debtPrincipalPaidByMonth(observations);
    expect(byMonth.get("2026-07")).toBe(40_000);
  });

  it("does not append duplicate unchanged broker uploads", () => {
    const once = appendDebtBalanceIfChanged([], 2_000_000, "broker-upload");
    const twice = appendDebtBalanceIfChanged(once, 2_000_000, "broker-upload");
    expect(twice).toHaveLength(1);
  });
});
