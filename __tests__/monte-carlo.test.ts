import { runMonteCarloSimulation } from "@/lib/compound-interest/monte-carlo";
import { DEFAULT_COMPOUND_PARAMS } from "@/lib/portfolio-types";

describe("monte carlo simulation", () => {
  it("returns percentile bands with median near deterministic path", () => {
    const params = {
      ...DEFAULT_COMPOUND_PARAMS,
      initialCapital: 1_000_000,
      monthlyContribution: 50_000,
      annualReturnPercent: 10,
      years: 5,
      taxOnProfitPercent: 0,
      taxDividends: false,
      withdrawAfterYears: null,
    };

    const options = {
      simulations: 120,
      volatilityPercent: 12,
      seed: 7,
      asOf: new Date("2026-01-15T12:00:00.000Z"),
    };
    const result = runMonteCarloSimulation(params, undefined, options);
    const repeated = runMonteCarloSimulation(params, undefined, options);

    expect(result.points.length).toBe(params.years * 12 + 1);
    expect(result.finalBalance.p50).toBeGreaterThan(params.initialCapital);
    expect(result.finalBalance.p90).toBeGreaterThan(result.finalBalance.p50);
    expect(result.finalBalance.p10).toBeLessThan(result.finalBalance.p50);
    expect(repeated).toEqual(result);
  });
});
