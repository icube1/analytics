import {
  averageRecentBrokerDeposits,
  buildLiveTrackingForecast,
} from "@/lib/tracking-forecast";
import { DEFAULT_COMPOUND_PARAMS, type SavedForecastPlan } from "@/lib/portfolio-types";
import { buildForecastPlan } from "@/lib/forecast-plans";

describe("tracking-forecast", () => {
  it("averages recent non-zero broker deposits", () => {
    const deposits = new Map([
      ["2026-05", 50_000],
      ["2026-06", 70_000],
      ["2026-07", 60_000],
    ]);
    const result = averageRecentBrokerDeposits(
      deposits,
      new Date(2026, 6, 19),
      3,
    );
    expect(result?.monthsUsed).toBe(3);
    expect(result?.average).toBeCloseTo(60_000, 0);
  });

  it("builds live forecast from fact start and hybrid contribution", () => {
    const customAssets = {
      items: [
        {
          id: "apt",
          enabled: true,
          label: "Квартира",
          value: 3_000_000,
          debt: 1_922_641,
          monthlyDebtPayment: 55_200,
          debtAnnualRate: 10.5,
          debtPaymentDay: 6,
          growsWithInflation: false,
          returnMode: "none" as const,
          annualReturnPercent: 0,
          incomeAmount: 0,
          incomePeriod: "monthly" as const,
          generatesDividendTax: false,
          notes: "",
        },
      ],
      otherDebts: [],
    };

    const plan = buildForecastPlan(
      "Базовый",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 60_000,
        debtPaymentsSeparateFromContribution: true,
        years: 5,
        contributionGrowthPercent: 0,
        adjustContributionsForInflation: false,
      },
      customAssets,
      500_000,
    );

    const deposits = new Map([
      ["2026-05", 55_000],
      ["2026-06", 65_000],
      ["2026-07", 60_000],
    ]);

    const currentBroker = 800_000;
    const currentGrand = currentBroker + (3_000_000 - 1_922_641);

    const forecast = buildLiveTrackingForecast({
      basePlan: plan,
      currentBrokerTotal: currentBroker,
      currentCustomAssets: customAssets,
      currentGrandTotal: currentGrand,
      depositsByMonth: deposits,
      horizonMonths: 12,
      asOf: new Date(2026, 6, 19),
    });

    expect(forecast.contributionSource).toBe("fact-average");
    expect(forecast.hybridMonthlyContribution).toBeCloseTo(60_000, 0);
    expect(forecast.points[0]?.isStart).toBe(true);
    expect(forecast.points[0]?.calendarMonth).toBe("2026-07");
    expect(forecast.points[0]?.balance).toBeCloseTo(currentGrand, 0);
    expect(forecast.points.length).toBe(13); // start + 12 months
    expect(forecast.points[1]?.calendarMonth).toBe("2026-08");
    expect(forecast.points[1]?.monthlyBrokerInvest).toBeGreaterThan(0);
    expect(forecast.points[1]?.monthlyDebtPrincipal).toBeGreaterThan(0);
    expect(forecast.points[12]?.balance).toBeGreaterThan(forecast.points[0]!.balance);
  });

  it("falls back to scenario contribution without deposit fact", () => {
    const plan: SavedForecastPlan = buildForecastPlan(
      "Без факта",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 45_000,
        years: 2,
        contributionGrowthPercent: 0,
      },
      { items: [], otherDebts: [] },
      100_000,
    );

    const forecast = buildLiveTrackingForecast({
      basePlan: plan,
      currentBrokerTotal: 100_000,
      currentCustomAssets: { items: [], otherDebts: [] },
      currentGrandTotal: 100_000,
      depositsByMonth: new Map(),
      horizonMonths: 12,
      asOf: new Date(2026, 6, 1),
    });

    expect(forecast.contributionSource).toBe("scenario");
    expect(forecast.hybridMonthlyContribution).toBe(45_000);
  });
});
