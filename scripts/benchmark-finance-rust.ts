#!/usr/bin/env tsx
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { calculateCompoundInterest, runMonteCarloSimulation } from "../lib/compound-interest";
import { DEFAULT_COMPOUND_PARAMS } from "../lib/portfolio-types";

const AS_OF = new Date("2026-01-15T12:00:00.000Z");

const baseParams = {
  ...DEFAULT_COMPOUND_PARAMS,
  initialCapital: 1_000_000,
  monthlyContribution: 60_000,
  annualReturnPercent: 10,
  inflationPercent: 5,
  years: 30,
};

function runRustBenchmark(): Record<string, unknown> {
  const rust = spawnSync(
    "cargo",
    ["bench", "-p", "finance-core", "--bench", "compound", "--", "--nocapture"],
    { encoding: "utf8" },
  );
  if (rust.status !== 0) {
    throw new Error(rust.stderr || rust.stdout || "Rust benchmark failed");
  }
  const jsonLine = rust.stdout
    .trim()
    .split("\n")
    .find((line) => line.startsWith("{"));
  if (!jsonLine) {
    throw new Error(`Rust benchmark produced no JSON:\n${rust.stdout}\n${rust.stderr}`);
  }
  return JSON.parse(jsonLine) as Record<string, unknown>;
}

function benchTs(name: string, iterations: number, run: () => unknown) {
  run();
  const timings: number[] = [];
  let output: unknown;
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    output = run();
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  return {
    name,
    iterations,
    timingMs: {
      min: timings[0],
      median: timings[Math.floor(timings.length / 2)],
      max: timings[timings.length - 1],
    },
    output,
  };
}

const tsResults = [
  benchTs("compound-30y-ts", 7, () =>
    calculateCompoundInterest(baseParams, undefined, { asOf: AS_OF, allMonths: true }),
  ),
  benchTs("monte-carlo-300x30y-ts", 3, () =>
    runMonteCarloSimulation(baseParams, undefined, {
      simulations: 300,
      volatilityPercent: 18,
      seed: 42,
      asOf: AS_OF,
    }),
  ),
];

const rustResults = runRustBenchmark();

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      asOf: AS_OF.toISOString(),
      typescript: tsResults,
      rust: rustResults,
    },
    null,
    2,
  ),
);
