import {
  calendarMonthFromPlanMonth,
  calendarMonthFromRuDate,
  extractBrokerDeposits,
  isBrokerDepositFlow,
} from "@/lib/broker-deposits";
import { buildForecastPlan, getPlanCalculatorSnapshot, resolvePlanParams } from "@/lib/forecast-plans";
import {
  aggregateBrokerDepositsByMonth,
  buildTrackingMonths,
  createBrokerSnapshot,
  getBalanceFactsByMonth,
} from "@/lib/tracking";
import {
  DEFAULT_COMPOUND_PARAMS,
  type BrokerReport,
  type CashFlow,
  type SavedForecastPlan,
} from "@/lib/portfolio-types";

function flow(
  partial: Partial<CashFlow> & Pick<CashFlow, "description" | "credit">,
): CashFlow {
  return {
    id: partial.id ?? "1",
    date: partial.date ?? "15.07.2026",
    description: partial.description,
    currency: partial.currency ?? "RUB",
    credit: partial.credit,
    debit: partial.debit ?? 0,
  };
}

describe("broker-deposits", () => {
  it("detects deposit flows and ignores dividends", () => {
    expect(
      isBrokerDepositFlow(
        flow({ description: "Пополнение счёта", credit: 50_000 }),
      ),
    ).toBe(true);
    expect(
      isBrokerDepositFlow(
        flow({ description: "Выплата дивидендов Полюс", credit: 1_730 }),
      ),
    ).toBe(false);
  });

  it("maps plan months from save date", () => {
    const savedAt = "2026-07-15T12:00:00.000Z";
    expect(calendarMonthFromPlanMonth(savedAt, 0)).toBe("2026-07");
    expect(calendarMonthFromPlanMonth(savedAt, 1)).toBe("2026-08");
  });

  it("parses russian dates to calendar months", () => {
    expect(calendarMonthFromRuDate("31.07.2026")).toBe("2026-07");
  });
});

describe("tracking snapshots", () => {
  const report: BrokerReport = {
    periodStart: "01.07.2026",
    periodEnd: "22.07.2026",
    createdAt: "",
    investor: "",
    contract: "",
    assetsStart: 100_000,
    assetsEnd: 150_000,
    assetsChange: 50_000,
    securitiesStart: 0,
    securitiesEnd: 0,
    cashStart: 0,
    cashEnd: 0,
    securities: [],
    cash: [],
    trades: [],
    cashFlows: [
      flow({
        id: "dep-1",
        date: "10.07.2026",
        description: "Пополнение счёта",
        credit: 30_000,
      }),
      flow({
        id: "dep-2",
        date: "18.07.2026",
        description: "Пополнение счёта",
        credit: 20_000,
      }),
    ],
  };

  it("creates snapshot with deposits", () => {
    const snapshot = createBrokerSnapshot(
      report,
      "test.html",
      { items: [], otherDebts: [] },
    );
    expect(snapshot.brokerTotal).toBe(150_000);
    expect(snapshot.deposits).toHaveLength(2);
  });

  it("deduplicates deposits across snapshots", () => {
    const snap1 = createBrokerSnapshot(
      report,
      "a.html",
      { items: [], otherDebts: [] },
    );
    snap1.uploadedAt = "2026-07-20T10:00:00.000Z";

    const snap2 = createBrokerSnapshot(
      report,
      "b.html",
      { items: [], otherDebts: [] },
    );
    snap2.uploadedAt = "2026-07-22T12:00:00.000Z";

    const byMonth = aggregateBrokerDepositsByMonth([snap1, snap2]);
    expect(byMonth.get("2026-07")).toBe(50_000);
  });

  it("uses latest snapshot per month for balance", () => {
    const snap1 = createBrokerSnapshot(
      { ...report, assetsEnd: 140_000, periodEnd: "15.07.2026" },
      "a.html",
      { items: [], otherDebts: [] },
    );
    snap1.uploadedAt = "2026-07-16T10:00:00.000Z";

    const snap2 = createBrokerSnapshot(
      report,
      "b.html",
      { items: [], otherDebts: [] },
    );
    snap2.uploadedAt = "2026-07-22T12:00:00.000Z";

    const balances = getBalanceFactsByMonth([snap1, snap2]);
    expect(balances.get("2026-07")?.grandTotal).toBe(150_000);
  });

  it("stores full monthly contributions starting at budget amount", () => {
    const plan = buildForecastPlan(
      "Базовый",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 60_000,
        years: 2,
        contributionGrowthPercent: 0,
        adjustContributionsForInflation: false,
      },
      { items: [], otherDebts: [] },
      100_000,
    );
    plan.savedAt = "2026-07-01T00:00:00.000Z";

    const first = plan.points.find((p) => p.calendarMonth === "2026-07");
    expect(first).toBeDefined();
    expect(first!.monthlyTotalContribution).toBe(60_000);
    expect(plan.points.length).toBeGreaterThanOrEqual(24);
  });

  it("builds tracking rows with plan and fact", () => {
    const plan = buildForecastPlan(
      "Базовый",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        initialCapital: 100_000,
        monthlyContribution: 60_000,
        years: 2,
        contributionGrowthPercent: 0,
      },
      { items: [], otherDebts: [] },
      100_000,
    );
    plan.savedAt = "2026-07-01T00:00:00.000Z";

    const snapshot = createBrokerSnapshot(
      report,
      "test.html",
      { items: [], otherDebts: [] },
    );

    const rows = buildTrackingMonths([plan], [snapshot], 0, 0);
    const july = rows.find((row) => row.calendarMonth === "2026-07");
    expect(july?.fact.grandTotal).toBe(150_000);
    expect(july?.fact.brokerDeposits).toBe(50_000);
    expect(july?.plans[plan.id]?.monthlyTotalContribution).toBe(60_000);
    expect(july?.plans[plan.id]?.balance).toBeDefined();
  });

  it("tracks debt principal paid from month-over-month debt reduction", () => {
    const customAssets = {
      items: [
        {
          id: "apt",
          enabled: true,
          label: "Квартира",
          value: 3_000_000,
          debt: 2_000_000,
          monthlyDebtPayment: 55_000,
          debtAnnualRate: 10,
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
      "С долгом",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 60_000,
        debtPaymentsSeparateFromContribution: true,
        years: 1,
        contributionGrowthPercent: 0,
      },
      customAssets,
      100_000,
    );
    plan.savedAt = "2026-07-01T00:00:00.000Z";

    const julySnapshot = createBrokerSnapshot(
      {
        ...report,
        periodEnd: "30.06.2026",
        assetsEnd: 100_000,
      },
      "june.html",
      { ...customAssets, items: [{ ...customAssets.items[0], debt: 2_000_000 }] },
    );
    julySnapshot.uploadedAt = "2026-07-05T12:00:00.000Z";

    const augustSnapshot = createBrokerSnapshot(
      {
        ...report,
        periodEnd: "31.07.2026",
        assetsEnd: 160_000,
      },
      "july.html",
      {
        ...customAssets,
        items: [{ ...customAssets.items[0], debt: 1_961_666 }],
      },
    );
    augustSnapshot.uploadedAt = "2026-08-05T12:00:00.000Z";

    const rows = buildTrackingMonths(
      [plan],
      [julySnapshot, augustSnapshot],
      1_961_666,
      3_000_000 - 1_961_666,
    );

    const july = rows.find((row) => row.calendarMonth === "2026-07");
    expect(july?.fact.debtPrincipalPaid).toBeCloseTo(38_334, 0);
    expect(july?.plans[plan.id]?.monthlyDebtPrincipal).toBeGreaterThan(30_000);
    expect(july?.plans[plan.id]?.monthlyDebtInterest).toBeGreaterThan(0);
    expect(july?.plans[plan.id]?.monthlyWealthBuilding).toBeCloseTo(
      60_000 + (july?.plans[plan.id]?.monthlyDebtPrincipal ?? 0),
      0,
    );
  });

  it("computes debt principal from assets history within the same month", () => {
    const history = [
      {
        id: "1",
        recordedAt: "2026-07-01T10:00:00.000Z",
        totalDebt: 2_000_000,
        source: "assets" as const,
      },
      {
        id: "2",
        recordedAt: "2026-07-15T10:00:00.000Z",
        totalDebt: 1_980_000,
        source: "assets" as const,
      },
    ];

    const rows = buildTrackingMonths([], [], 1_980_000, 0, history);
    const july = rows.find((row) => row.calendarMonth === "2026-07");
    expect(july?.fact.debtPrincipalPaid).toBe(20_000);
  });

  it("uses plan debt as baseline when snapshots have no debt history", () => {
    const plan = buildForecastPlan(
      "С долгом",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 60_000,
        debtPaymentsSeparateFromContribution: true,
        years: 1,
        contributionGrowthPercent: 0,
      },
      {
        items: [
          {
            id: "apt",
            enabled: true,
            label: "Квартира",
            value: 3_000_000,
            debt: 2_000_000,
            monthlyDebtPayment: 55_000,
            debtAnnualRate: 10,
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
      },
      100_000,
    );
    plan.savedAt = "2026-06-01T00:00:00.000Z";

    const rows = buildTrackingMonths([plan], [], 1_960_000, 1_040_000, []);
    const july = rows.find((row) => row.calendarMonth === "2026-07");
    expect(july?.fact.debtPrincipalPaid).toBe(40_000);
  });

  it("restores calculator snapshot from saved plan", () => {
    const plan = buildForecastPlan(
      "Снимок",
      {
        ...DEFAULT_COMPOUND_PARAMS,
        monthlyContribution: 45_000,
        years: 3,
      },
      {
        items: [
          {
            id: "apt",
            enabled: true,
            label: "Квартира",
            value: 1_000_000,
            debt: 500_000,
            monthlyDebtPayment: 30_000,
            debtAnnualRate: 8,
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
      },
      250_000,
    );

    const snapshot = getPlanCalculatorSnapshot(plan);
    expect(snapshot.brokerTotal).toBe(250_000);
    expect(snapshot.params.monthlyContribution).toBe(45_000);
    expect(snapshot.customAssets.items[0]?.debt).toBe(500_000);

    const legacyPlan = {
      ...plan,
      params: {
        monthlyContribution: 70_000,
        years: 5,
      } as SavedForecastPlan["params"],
    };
    expect(resolvePlanParams(legacyPlan).monthlyContribution).toBe(70_000);
    expect(resolvePlanParams(legacyPlan).annualReturnPercent).toBe(
      DEFAULT_COMPOUND_PARAMS.annualReturnPercent,
    );
  });
});

describe("extractBrokerDeposits", () => {
  it("extracts only deposit credits from report", () => {
    const deposits = extractBrokerDeposits({
      periodStart: "",
      periodEnd: "",
      createdAt: "",
      investor: "",
      contract: "",
      assetsStart: 0,
      assetsEnd: 0,
      assetsChange: 0,
      securitiesStart: 0,
      securitiesEnd: 0,
      cashStart: 0,
      cashEnd: 0,
      securities: [],
      cash: [],
      trades: [],
      cashFlows: [
        flow({ description: "Зачисление денежных средств", credit: 10_000 }),
        flow({ description: "Сделка от 01.07.2026", credit: 0, debit: 5000 }),
      ],
    });
    expect(deposits).toHaveLength(1);
    expect(deposits[0].amount).toBe(10_000);
  });
});
