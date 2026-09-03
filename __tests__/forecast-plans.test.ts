import { DEFAULT_COMPOUND_PARAMS } from "@/lib/portfolio-types";
import {
  buildForecastPlan,
  forecastPlanFromProjection,
} from "@/lib/forecast-plans";
import { calculateCompoundInterest } from "@/lib/compound-interest";

describe("forecast plans", () => {
  it("builds the same saved plan from a precomputed projection", () => {
    const params = {
      ...DEFAULT_COMPOUND_PARAMS,
      years: 2,
      monthlyContribution: 10_000,
    };
    const customAssets = { items: [], otherDebts: [] };
    const savedAt = "2026-01-15T00:00:00.000Z";
    const fromEngine = buildForecastPlan(
      "База",
      params,
      customAssets,
      50_000,
      savedAt,
    );
    const result = calculateCompoundInterest(
      params,
      { customAssets, brokerTotal: 50_000 },
      { allMonths: true },
    );
    const fromProjection = forecastPlanFromProjection(
      "База",
      params,
      customAssets,
      50_000,
      result,
      savedAt,
    );

    expect(fromProjection.points).toEqual(fromEngine.points);
    expect(fromProjection.summary).toEqual(fromEngine.summary);
    expect(fromProjection.params).toEqual(params);
  });
});
