import {
  calendarMonthFromPlanMonth,
  calendarMonthFromRuDate,
  extractBrokerDeposits,
  isBrokerDepositFlow,
} from "@/lib/broker-deposits";
import { buildForecastPlan } from "@/lib/forecast-plans";
import { calculateCompoundInterest } from "@/lib/compound-interest";
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

  it("builds tracking rows with plan and fact", () => {
    const result = calculateCompoundInterest({
      ...DEFAULT_COMPOUND_PARAMS,
      initialCapital: 100_000,
      monthlyContribution: 60_000,
      years: 2,
      contributionGrowthPercent: 0,
    });
    const plan = buildForecastPlan(
      "Базовый",
      DEFAULT_COMPOUND_PARAMS,
      { items: [], otherDebts: [] },
      100_000,
      result,
    );
  plan.savedAt = "2026-07-01T00:00:00.000Z";

    const snapshot = createBrokerSnapshot(
      report,
      "test.html",
      { items: [], otherDebts: [] },
    );

    const rows = buildTrackingMonths([plan], [snapshot], 0);
    const july = rows.find((row) => row.calendarMonth === "2026-07");
    expect(july?.fact.grandTotal).toBe(150_000);
    expect(july?.fact.brokerDeposits).toBe(50_000);
    expect(july?.plans[plan.id]?.balance).toBeDefined();
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
