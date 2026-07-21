import { createTermDeposit } from "@/lib/custom-assets";
import {
  depositMaturesInSimulationMonth,
  estimateDepositMaturityValue,
  formatDepositMaturityDate,
  getDepositMonthsRemaining,
  isDepositActive,
} from "@/lib/term-deposits";

describe("term deposits", () => {
  it("estimates simple interest at maturity", () => {
    expect(
      estimateDepositMaturityValue(1_000_000, 25, 6, "at_maturity", "simple"),
    ).toBeCloseTo(1_125_000, 0);
  });

  it("tracks maturity date and remaining months", () => {
    const item = createTermDeposit({
      value: 500_000,
      annualReturnPercent: 25,
      depositTermMonths: 6,
      depositOpenedAt: "2026-01-15",
    });

    expect(formatDepositMaturityDate(item)).toBe("2026-07-15");
    expect(isDepositActive(item, new Date(2026, 3, 1))).toBe(true);
    expect(isDepositActive(item, new Date(2026, 6, 15))).toBe(false);
    expect(getDepositMonthsRemaining(item, new Date(2026, 3, 1))).toBeGreaterThan(
      0,
    );
    expect(getDepositMonthsRemaining(item, new Date(2026, 7, 1))).toBe(0);
  });

  it("detects maturity in simulation month", () => {
    const item = createTermDeposit({
      depositOpenedAt: "2026-01-15",
      depositTermMonths: 6,
    });
    const asOf = new Date(2026, 0, 20);

    expect(depositMaturesInSimulationMonth(item, asOf, 5)).toBe(false);
    expect(depositMaturesInSimulationMonth(item, asOf, 6)).toBe(true);
  });
});
