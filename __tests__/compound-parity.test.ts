import { compoundResultsMatch } from "@/lib/compound-parity";
import { calculateCompoundInterest } from "@/lib/compound-interest";
import { DEFAULT_COMPOUND_PARAMS } from "@/lib/portfolio-types";

describe("compound parity helpers", () => {
  it("matches identical TS results", () => {
    const params = {
      ...DEFAULT_COMPOUND_PARAMS,
      years: 3,
      monthlyContribution: 10_000,
    };
    const left = calculateCompoundInterest(params, undefined, {
      asOf: new Date("2026-01-15"),
    });
    const right = calculateCompoundInterest(params, undefined, {
      asOf: new Date("2026-01-15"),
    });
    expect(compoundResultsMatch(left, right)).toBe(true);
  });
});
