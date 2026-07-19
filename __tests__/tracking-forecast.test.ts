import {
  averageRecentBrokerDeposits,
  buildLiveTrackingForecast,
  remainingWithdrawAfterYears,
  resolveForecastHorizonMonths,
  scenarioRemainingMonths,
  scenarioWithdrawCalendarMonth,
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

  it("defaults to scenario contribution and exposes fact average as suggestion", () => {
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
      ["2026-05", 20_000],
      ["2026-06", 25_000],
      ["2026-07", 15_000],
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

    // Без ручного ввода — взнос сценария, а не заниженное среднее факта
    expect(forecast.monthlyContribution).toBe(60_000);
    expect(forecast.suggestedFromScenario).toBe(60_000);
    expect(forecast.suggestedFromFact).toBeCloseTo(20_000, 0);
    expect(forecast.factMonthsUsed).toBe(3);
    expect(forecast.points[0]?.isStart).toBe(true);
    expect(forecast.points[0]?.calendarMonth).toBe("2026-07");
    expect(forecast.points[0]?.balance).toBeCloseTo(currentGrand, 0);
    expect(forecast.points.length).toBe(13);
    expect(forecast.points[1]?.calendarMonth).toBe("2026-08");
    expect(forecast.points[1]?.monthlyBrokerInvest).toBe(60_000);
  });

  it("uses manual monthly contribution when provided", () => {
    const plan: SavedForecastPlan = buildForecastPlan(
      "Ручной",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 45_000,
        years: 2,
        contributionGrowthPercent: 0,
        debtPaymentsSeparateFromContribution: true,
      },
      { items: [], otherDebts: [] },
      100_000,
    );

    const forecast = buildLiveTrackingForecast({
      basePlan: plan,
      currentBrokerTotal: 100_000,
      currentCustomAssets: { items: [], otherDebts: [] },
      currentGrandTotal: 100_000,
      depositsByMonth: new Map([["2026-07", 10_000]]),
      horizonMonths: 12,
      monthlyContribution: 80_000,
      asOf: new Date(2026, 6, 1),
    });

    expect(forecast.monthlyContribution).toBe(80_000);
    expect(forecast.suggestedFromScenario).toBe(45_000);
    expect(forecast.suggestedFromFact).toBe(10_000);
    expect(forecast.points[1]?.monthlyBrokerInvest).toBe(80_000);
  });

  it("keeps the same absolute withdrawal calendar month as the scenario", () => {
    const plan = buildForecastPlan(
      "С выводом",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 60_000,
        years: 15,
        withdrawAfterYears: 10,
        monthlyWithdrawal: 80_000,
        contributionGrowthPercent: 0,
        debtPaymentsSeparateFromContribution: true,
      },
      { items: [], otherDebts: [] },
      100_000,
    );
    plan.savedAt = "2026-07-01T00:00:00.000Z";

    expect(scenarioWithdrawCalendarMonth(plan)).toBe("2036-07");

    // Через 2 года после сохранения — до вывода ~8 лет, дата та же (июл 2036)
    const asOf = new Date(2028, 6, 19);
    expect(remainingWithdrawAfterYears(plan, asOf)).toBeCloseTo(95 / 12, 5);

    const forecast = buildLiveTrackingForecast({
      basePlan: plan,
      currentBrokerTotal: 200_000,
      currentCustomAssets: { items: [], otherDebts: [] },
      currentGrandTotal: 200_000,
      depositsByMonth: new Map(),
      horizonMonths: 120,
      monthlyContribution: 60_000,
      asOf,
    });

    expect(forecast.withdrawCalendarMonth).toBe("2036-07");
    expect(forecast.withdrawAfterYears).toBeCloseTo(95 / 12, 5);

    // В месяце начала вывода пополнения уже не идут
    const withdrawRow = forecast.points.find((p) => p.calendarMonth === "2036-07");
    const beforeWithdraw = forecast.points.find((p) => p.calendarMonth === "2036-06");
    expect(beforeWithdraw?.monthlyBrokerInvest).toBeGreaterThan(0);
    expect(withdrawRow?.monthlyBrokerInvest ?? 0).toBe(0);
  });

  it("resolves scenario horizon to remaining months until plan end", () => {
    const plan = buildForecastPlan(
      "Длинный",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 60_000,
        years: 10,
        contributionGrowthPercent: 0,
      },
      { items: [], otherDebts: [] },
      100_000,
    );
    plan.savedAt = "2026-07-01T00:00:00.000Z";

    const months = scenarioRemainingMonths(plan, new Date(2026, 6, 19));
    expect(months).toBe(119);

    expect(resolveForecastHorizonMonths("scenario", plan, new Date(2026, 6, 19))).toBe(
      119,
    );
    expect(resolveForecastHorizonMonths("3y", plan)).toBe(36);
  });
});
