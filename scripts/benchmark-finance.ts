import { performance } from "node:perf_hooks";
import { calculateCompoundInterest, runMonteCarloSimulation } from "../lib/compound-interest";
import type { CompoundContext } from "../lib/compound-interest";
import { DEFAULT_COMPOUND_PARAMS } from "../lib/portfolio-types";

const AS_OF = new Date("2026-01-15T12:00:00.000Z");

const baseParams = {
  ...DEFAULT_COMPOUND_PARAMS,
  initialCapital: 1_000_000,
  monthlyContribution: 60_000,
  annualReturnPercent: 10,
  inflationPercent: 5,
  years: 30,
  taxOnProfitPercent: 13,
  contributionGrowthPercent: 3,
};

const householdContext: CompoundContext = {
  brokerTotal: 500_000,
  customAssets: {
    items: [
      {
        id: "home",
        enabled: true,
        label: "Жильё",
        value: 5_500_000,
        debt: 3_200_000,
        monthlyDebtPayment: 45_000,
        debtAnnualRate: 12,
        debtPaymentDay: 6,
        growsWithInflation: true,
        returnMode: "none",
        annualReturnPercent: 0,
        incomeAmount: 0,
        incomePeriod: "monthly",
        generatesDividendTax: false,
        notes: "",
      },
      {
        id: "deposit",
        enabled: true,
        label: "Резерв",
        assetKind: "deposit",
        value: 600_000,
        debt: 0,
        monthlyDebtPayment: 0,
        debtAnnualRate: 0,
        growsWithInflation: false,
        returnMode: "percent",
        annualReturnPercent: 16,
        incomeAmount: 0,
        incomePeriod: "monthly",
        generatesDividendTax: false,
        depositTermMonths: 12,
        depositOpenedAt: "2026-01-15",
        depositInterestMode: "at_maturity",
        notes: "",
      },
    ],
    otherDebts: [],
  },
};

interface BenchmarkResult {
  name: string;
  iterations: number;
  timingMs: {
    min: number;
    median: number;
    max: number;
  };
  rssMb: number;
  output: unknown;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function benchmark<T>(
  name: string,
  iterations: number,
  run: () => T,
  summarize: (result: T) => unknown,
): BenchmarkResult {
  run();
  const timings: number[] = [];
  let result: T | undefined;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    result = run();
    timings.push(performance.now() - startedAt);
  }

  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(timings.length / 2)];

  return {
    name,
    iterations,
    timingMs: {
      min: round(timings[0]),
      median: round(median),
      max: round(timings[timings.length - 1]),
    },
    rssMb: round(process.memoryUsage().rss / 1024 / 1024),
    output: summarize(result as T),
  };
}

const results = [
  benchmark(
    "compound-30y",
    7,
    () =>
      calculateCompoundInterest(baseParams, undefined, {
        asOf: AS_OF,
        allMonths: true,
      }),
    (result) => ({
      points: result.points.length,
      finalBalance: round(result.finalBalance),
      finalRealBalance: round(result.finalRealBalance),
    }),
  ),
  benchmark(
    "household-debt-and-deposit-30y",
    7,
    () =>
      calculateCompoundInterest(
        {
          ...baseParams,
          initialCapital: 3_400_000,
          debtPaymentsSeparateFromContribution: true,
        },
        householdContext,
        { asOf: AS_OF, allMonths: true },
      ),
    (result) => ({
      points: result.points.length,
      finalBalance: round(result.finalBalance),
      debtPrincipalPaid: round(result.totalDebtPrincipalPaid),
    }),
  ),
  benchmark(
    "monte-carlo-300x30y",
    3,
    () =>
      runMonteCarloSimulation(baseParams, undefined, {
        simulations: 300,
        volatilityPercent: 18,
        seed: 42,
        asOf: AS_OF,
      }),
    (result) => ({
      points: result.points.length,
      simulations: result.simulations,
      finalP10: round(result.finalBalance.p10),
      finalP50: round(result.finalBalance.p50),
      finalP90: round(result.finalBalance.p90),
    }),
  ),
];

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      asOf: AS_OF.toISOString(),
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
      results,
    },
    null,
    2,
  ),
);
