import { calculateCompoundInterest } from "@/lib/compound-interest";
import {
  computeSafeWithdrawalAdvice,
  fixedRealToNominalPercent,
  isWithdrawalSustainable,
} from "@/lib/safe-withdrawal";
import { DEFAULT_COMPOUND_PARAMS } from "@/lib/portfolio-types";

const retirementBase = {
  ...DEFAULT_COMPOUND_PARAMS,
  initialCapital: 1_000_000,
  monthlyContribution: 50_000,
  annualReturnPercent: 12,
  inflationPercent: 6,
  years: 30,
  contributionGrowthPercent: 0,
  taxOnProfitPercent: 0,
  taxDividends: false,
  withdrawAfterYears: 10,
  reinvestFreedDebtPayments: false,
};

describe("isWithdrawalSustainable", () => {
  it("returns false when liquidity is depleted before the horizon ends", () => {
    const result = calculateCompoundInterest({
      ...retirementBase,
      withdrawalMode: "fixed",
      monthlyWithdrawal: 120_000,
      annualWithdrawalPercent: 0,
    });

    expect(isWithdrawalSustainable(result, retirementBase)).toBe(false);
  });

  it("returns true for a modest fixed withdrawal", () => {
    const result = calculateCompoundInterest({
      ...retirementBase,
      withdrawalMode: "fixed",
      monthlyWithdrawal: 20_000,
      annualWithdrawalPercent: 0,
    });

    expect(isWithdrawalSustainable(result, retirementBase)).toBe(true);
  });
});

describe("computeSafeWithdrawalAdvice", () => {
  it("returns null when withdrawal phase is disabled", () => {
    expect(
      computeSafeWithdrawalAdvice({
        ...retirementBase,
        withdrawAfterYears: null,
      }),
    ).toBeNull();
  });

  it("recommends a positive safe percent below nominal return", () => {
    const advice = computeSafeWithdrawalAdvice({
      ...retirementBase,
      withdrawalMode: "percent",
      annualWithdrawalPercent: 8,
      monthlyWithdrawal: 0,
    });

    expect(advice).not.toBeNull();
    expect(advice!.maxAnnualPercent).toBeGreaterThan(0);
    expect(advice!.maxAnnualPercent).toBeLessThan(
      retirementBase.annualReturnPercent,
    );
    expect(advice!.liquidityAtWithdrawalStart).toBeGreaterThan(0);
  });

  it("marks aggressive percent withdrawal as unsafe", () => {
    const advice = computeSafeWithdrawalAdvice({
      ...retirementBase,
      withdrawalMode: "percent",
      annualWithdrawalPercent: 20,
      monthlyWithdrawal: 0,
    });

    expect(advice).not.toBeNull();
    expect(advice!.currentIsSafe).toBe(false);
    expect(advice!.maxAnnualPercent).toBeLessThan(20);
  });

  it("recommends a safe fixed monthly amount", () => {
    const advice = computeSafeWithdrawalAdvice({
      ...retirementBase,
      withdrawalMode: "fixed",
      monthlyWithdrawal: 150_000,
      annualWithdrawalPercent: 0,
    });

    expect(advice).not.toBeNull();
    expect(advice!.maxMonthlyReal).toBeGreaterThan(0);
    expect(advice!.maxMonthlyReal).toBeLessThan(150_000);
    expect(advice!.currentIsSafe).toBe(false);
  });

  it("marks modest fixed withdrawal as safe", () => {
    const advice = computeSafeWithdrawalAdvice({
      ...retirementBase,
      withdrawalMode: "fixed",
      monthlyWithdrawal: 20_000,
      annualWithdrawalPercent: 0,
    });

    expect(advice).not.toBeNull();
    expect(advice!.currentIsSafe).toBe(true);
    expect(advice!.maxMonthlyReal).toBeGreaterThanOrEqual(20_000);
  });

  it("expresses percent limit as net first-month payout", () => {
    const advice = computeSafeWithdrawalAdvice({
      ...retirementBase,
      withdrawalMode: "percent",
      annualWithdrawalPercent: 4,
      monthlyWithdrawal: 0,
    });

    expect(advice).not.toBeNull();
    const atMax = calculateCompoundInterest({
      ...retirementBase,
      withdrawalMode: "percent",
      annualWithdrawalPercent: advice!.maxAnnualPercent,
      monthlyWithdrawal: 0,
    });

    expect(advice!.maxPercentAsMonthlyReal).toBeCloseTo(
      atMax.withdrawalStartPayoutReal,
      0,
    );
  });

  it("aligns current percent payout with simulation start payout", () => {
    const params = {
      ...retirementBase,
      withdrawalMode: "percent" as const,
      annualWithdrawalPercent: 7,
      monthlyWithdrawal: 0,
    };
    const advice = computeSafeWithdrawalAdvice(params);
    const result = calculateCompoundInterest(params);

    expect(advice!.currentStartPayoutReal).toBeCloseTo(
      result.withdrawalStartPayoutReal,
      0,
    );
  });

  it("shows fixed and percent limits use different units at withdrawal start", () => {
    const params = {
      ...retirementBase,
      inflationPercent: 6,
      withdrawAfterYears: 15,
      withdrawalMode: "percent" as const,
      annualWithdrawalPercent: 2.5,
      monthlyWithdrawal: 0,
    };
    const advice = computeSafeWithdrawalAdvice(params)!;
    const percentResult = calculateCompoundInterest(params);
    const nominalPct = fixedRealToNominalPercent(
      advice.maxMonthlyReal,
      advice.liquidityAtWithdrawalStart,
      params,
    );

    expect(advice.maxMonthlyAsNominalPercent).toBeCloseTo(nominalPct, 1);
    expect(advice.maxMonthlyAsNominalPercent).toBeGreaterThan(2.5);
    expect(percentResult.withdrawalStartPayoutReal).toBeLessThan(
      advice.maxMonthlyReal * 0.5,
    );
  });
});
