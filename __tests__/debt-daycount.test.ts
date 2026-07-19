import { amortizeDebtMonth, estimateCurrentDebtPaymentBreakdown } from "@/lib/debt-amortization";
import {
  currentPaymentPeriodDays,
  interestForPeriod,
  surroundingPaymentDates,
} from "@/lib/debt-daycount";
import type { CustomAssets } from "@/lib/portfolio-types";

describe("Alfa Bank day-count amortization", () => {
  const asOf = new Date(2026, 6, 19); // 19.07.2026 — дата выписки

  it("uses 31 days from 6 Jul to 6 Aug for current period", () => {
    expect(currentPaymentPeriodDays(6, asOf)).toBe(31);
    const { previous, next } = surroundingPaymentDates(asOf, 6);
    expect(previous.toLocaleDateString("ru-RU")).toBe("06.07.2026");
    expect(next.toLocaleDateString("ru-RU")).toBe("06.08.2026");
  });

  it("matches Aug 2026 payment from the bank schedule", () => {
    // Выписка: остаток ОД 1 922 641,02; платёж 06.08.2026:
    // проценты 17 145,75 · тело 38 054,25
    const balance = 1_922_641.02;
    const payment = 55_200;
    const rate = 10.5;
    const periodDays = 31;

    const interest = interestForPeriod(balance, rate, periodDays);
    expect(interest).toBeCloseTo(17_145.75, 1);

    const step = amortizeDebtMonth(balance, payment, rate, { periodDays });
    expect(step.interest).toBeCloseTo(17_145.75, 1);
    expect(step.principal).toBeCloseTo(38_054.25, 1);
  });

  it("matches Jul 2026 payment with 28-day period (8 Jun → 6 Jul)", () => {
    const balance = 1_962_037.22;
    const step = amortizeDebtMonth(balance, 55_200, 10.5, { periodDays: 28 });
    expect(step.interest).toBeCloseTo(15_803.8, 1);
    expect(step.principal).toBeCloseTo(39_396.2, 1);
  });

  it("estimateCurrentDebtPaymentBreakdown uses payment day and asOf", () => {
    const assets: CustomAssets = {
      items: [
        {
          id: "loan",
          enabled: true,
          label: "Кредит Альфа",
          value: 0,
          debt: 1_922_641.02,
          monthlyDebtPayment: 55_200,
          debtAnnualRate: 10.5,
          debtPaymentDay: 6,
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
    };

    const breakdown = estimateCurrentDebtPaymentBreakdown(assets, asOf);
    expect(breakdown.totalPayment).toBe(55_200);
    expect(breakdown.totalInterest).toBeCloseTo(17_145.75, 1);
    expect(breakdown.totalPrincipal).toBeCloseTo(38_054.25, 1);
  });
});
