import { calculateCompoundInterest } from "@/lib/compound-interest";
import { DEFAULT_COMPOUND_PARAMS } from "@/lib/portfolio-types";

const baseParams = {
  ...DEFAULT_COMPOUND_PARAMS,
  initialCapital: 100_000,
  monthlyContribution: 60_000,
  annualReturnPercent: 12,
  years: 10,
  contributionGrowthPercent: 0,
  taxOnProfitPercent: 0,
  taxDividends: false,
  withdrawAfterYears: null,
};

function fvBeginning(
  principal: number,
  payment: number,
  annualPercent: number,
  years: number,
  simple: boolean,
): number {
  const months = years * 12;
  const monthlyRate = simple
    ? annualPercent / 100 / 12
    : (1 + annualPercent / 100) ** (1 / 12) - 1;
  let balance = principal;
  for (let month = 1; month <= months; month++) {
    balance = (balance + payment) * (1 + monthlyRate);
  }
  return balance;
}

function fvFormulaBeginning(
  principal: number,
  payment: number,
  annualPercent: number,
  years: number,
): number {
  const months = years * 12;
  const monthlyRate = (1 + annualPercent / 100) ** (1 / 12) - 1;
  return (
    principal * (1 + monthlyRate) ** months +
    payment * (1 + monthlyRate) * (((1 + monthlyRate) ** months - 1) / monthlyRate)
  );
}

describe("calculateCompoundInterest", () => {
  it("matches the effective monthly-rate reference formula", () => {
    const result = calculateCompoundInterest({
      ...baseParams,
      monthlyRateMethod: "effective",
    });
    expect(result.finalBalance).toBeCloseTo(
      fvFormulaBeginning(100_000, 60_000, 12, 10),
      0,
    );
  });

  it("matches the simple monthly-rate reference formula", () => {
    const result = calculateCompoundInterest({
      ...baseParams,
      monthlyRateMethod: "simple",
    });
    expect(result.finalBalance).toBeCloseTo(
      fvBeginning(100_000, 60_000, 12, 10, true),
      0,
    );
  });

  it("grows more with more frequent compounding at the same annual rate", () => {
    const shared = {
      ...baseParams,
      initialCapital: 1_000_000,
      monthlyContribution: 100_000,
      annualReturnPercent: 15,
      years: 5,
      monthlyRateMethod: "effective" as const,
    };

    const monthly = calculateCompoundInterest({
      ...shared,
      compoundFrequency: "monthly",
    }).finalBalance;
    const yearly = calculateCompoundInterest({
      ...shared,
      compoundFrequency: "yearly",
    }).finalBalance;

    expect(monthly).toBeGreaterThan(yearly);
  });

  it("detects early liquidity depletion for aggressive fixed withdrawals", () => {
    const result = calculateCompoundInterest({
      ...baseParams,
      years: 30,
      annualReturnPercent: 5,
      inflationPercent: 6,
      withdrawAfterYears: 10,
      withdrawalMode: "fixed",
      monthlyWithdrawal: 100_000,
      annualWithdrawalPercent: 0,
    });

    expect(result.withdrawalEndedEarly).toBe(true);
    expect(result.withdrawalMonthsWithoutPayout).toBeGreaterThan(0);
  });

  it("recalculates percent payout target from current balance each month", () => {
    const result = calculateCompoundInterest({
      ...baseParams,
      years: 20,
      inflationPercent: 2,
      annualReturnPercent: 12,
      withdrawAfterYears: 10,
      withdrawalMode: "percent",
      annualWithdrawalPercent: 4,
      monthlyWithdrawal: 0,
      taxOnProfitPercent: 0,
    });

    const firstWithdrawal = result.points.find((p) => p.inWithdrawalPhase);
    expect(firstWithdrawal).toBeDefined();
    expect(firstWithdrawal!.monthlyPayoutTargetReal).toBeGreaterThan(0);
    expect(firstWithdrawal!.monthlyPayoutReal).toBeGreaterThan(0);
    expect(result.withdrawalStartPayoutReal).toBeCloseTo(
      firstWithdrawal!.monthlyPayoutReal,
      0,
    );

    const withdrawalPoints = result.points.filter(
      (p) => p.inWithdrawalPhase && p.monthlyPayoutTargetReal > 0,
    );
    expect(withdrawalPoints.length).toBeGreaterThan(1);
    expect(
      withdrawalPoints[withdrawalPoints.length - 1].monthlyPayoutTargetReal,
    ).toBeGreaterThan(withdrawalPoints[0].monthlyPayoutTargetReal);

    for (const p of withdrawalPoints) {
      const inflationFactor = (1 + 0.02 / 12) ** p.month;
      const nominalTarget = p.monthlyPayoutTargetReal * inflationFactor;
      expect(nominalTarget / p.liquidityBalance).toBeCloseTo(4 / 12 / 100, 4);
    }

    expect(result.withdrawalEndedEarly).toBe(false);
  });
});
