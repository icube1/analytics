import { calculateCompoundInterest } from "../lib/compound-interest.ts";
import { DEFAULT_COMPOUND_PARAMS } from "../lib/portfolio-types.ts";

const base = {
  ...DEFAULT_COMPOUND_PARAMS,
  initialCapital: 100_000,
  monthlyContribution: 60_000,
  annualReturnPercent: 12,
  years: 10,
  contributionGrowthPercent: 0,
  taxOnProfitPercent: 0,
  taxDividends: false,
};

function fvBeginning(P, PMT, annual, years, simple) {
  const n = years * 12;
  const r = simple ? annual / 100 / 12 : (1 + annual / 100) ** (1 / 12) - 1;
  let bal = P;
  for (let m = 1; m <= n; m++) {
    bal = (bal + PMT) * (1 + r);
  }
  return bal;
}

function fvFormulaBeginning(P, PMT, annual, years) {
  const n = years * 12;
  const r = (1 + annual / 100) ** (1 / 12) - 1;
  return P * (1 + r) ** n + PMT * (1 + r) * (((1 + r) ** n - 1) / r);
}

for (const method of ["effective", "simple"]) {
  const ours = calculateCompoundInterest({
    ...base,
    monthlyRateMethod: method,
  }).finalBalance;
  const ref =
    method === "effective"
      ? fvFormulaBeginning(100000, 60000, 12, 10)
      : fvBeginning(100000, 60000, 12, 10, true);
  console.log(
    `${method}: ours=${Math.round(ours)} ref=${Math.round(ref)} diff=${Math.round(ours - ref)}`,
  );
}
