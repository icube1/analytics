import {
  carryForwardLosses,
  iisClosureTax,
  iisContributionDeduction,
  iisMinimumHoldingYears,
  ndflBroker,
  netBrokerResult,
} from "@/lib/tax";

describe("ndflBroker", () => {
  it("charges 13% up to 2,4 млн ₽", () => {
    expect(ndflBroker(1_000_000).total).toBeCloseTo(130_000, 2);
    expect(ndflBroker(2_400_000).total).toBeCloseTo(312_000, 2);
  });

  it("charges 15% above the threshold and keeps the first band flat", () => {
    const result = ndflBroker(3_400_000);
    expect(result.total).toBeCloseTo(462_000, 2);
    expect(result.bands).toHaveLength(2);
    expect(result.bands[1].rate).toBe(0.15);
    expect(result.bands[1].base).toBeCloseTo(1_000_000, 2);
  });

  it("returns zero for a loss", () => {
    expect(ndflBroker(-75_203.11).total).toBe(0);
  });
});

describe("iisMinimumHoldingYears", () => {
  it("is 5 years for contracts opened in 2024–2026", () => {
    expect(iisMinimumHoldingYears(2024)).toBe(5);
    expect(iisMinimumHoldingYears(2026)).toBe(5);
  });

  it("grows by a year until 10", () => {
    expect(iisMinimumHoldingYears(2027)).toBe(6);
    expect(iisMinimumHoldingYears(2029)).toBe(8);
    expect(iisMinimumHoldingYears(2031)).toBe(10);
    expect(iisMinimumHoldingYears(2040)).toBe(10);
  });
});

describe("iisContributionDeduction", () => {
  it("returns 13% of 400 000 ₽ deposits", () => {
    const result = iisContributionDeduction({ deposits: 400_000, ndflRate: 0.13 });
    expect(result.eligible).toBe(400_000);
    expect(result.refund).toBeCloseTo(52_000, 2);
  });

  it("caps the base at the 400 000 ₽ limit", () => {
    const result = iisContributionDeduction({ deposits: 900_000, ndflRate: 0.15 });
    expect(result.eligible).toBe(400_000);
    expect(result.refund).toBeCloseTo(60_000, 2);
  });

  it("never exceeds the tax actually paid", () => {
    const result = iisContributionDeduction({
      deposits: 400_000,
      ndflRate: 0.13,
      paidNdfl: 30_000,
    });
    expect(result.refund).toBeCloseTo(30_000, 2);
    expect(result.limitedByPaidTax).toBe(true);
  });
});

describe("iisClosureTax", () => {
  it("applies the income deduction only after the minimum holding period", () => {
    const early = iisClosureTax({ finResult: 1_000_000, contractYear: 2025, heldYears: 2 });
    expect(early.deductionAvailable).toBe(false);
    expect(early.tax).toBeCloseTo(130_000, 2);

    const matured = iisClosureTax({ finResult: 1_000_000, contractYear: 2025, heldYears: 5 });
    expect(matured.deductionAvailable).toBe(true);
    expect(matured.taxFree).toBe(1_000_000);
    expect(matured.tax).toBe(0);
  });

  it("caps the tax-free part at 30 млн ₽", () => {
    const result = iisClosureTax({
      finResult: 35_000_000,
      contractYear: 2025,
      heldYears: 6,
    });
    expect(result.taxFree).toBe(30_000_000);
    expect(result.taxable).toBe(5_000_000);
    // 13% с 2,4 млн + 15% с 2,6 млн
    expect(result.tax).toBeCloseTo(312_000 + 390_000, 2);
  });
});

describe("carryForwardLosses", () => {
  it("uses the oldest loss first and keeps the remainder", () => {
    const result = carryForwardLosses([{ year: "2025", amount: 100_000 }], 60_000, 2026);
    expect(result.used).toBe(60_000);
    expect(result.taxableBase).toBe(0);
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0].amount).toBe(40_000);
  });

  it("drops losses older than 10 years", () => {
    const result = carryForwardLosses([{ year: "2015", amount: 50_000 }], 100_000, 2026);
    expect(result.used).toBe(0);
    expect(result.expired).toHaveLength(1);
    expect(result.taxableBase).toBe(100_000);
  });
});

describe("netBrokerResult", () => {
  it("nets profit of one account against loss of another", () => {
    expect(netBrokerResult([120_000, -75_203.11])).toBeCloseTo(44_796.89, 2);
  });
});
