import type { CompoundParams } from "./portfolio-types";
import type { CompoundContext, CompoundResult } from "./compound-interest/types";
import type { MonteCarloOptions, MonteCarloResult } from "./compound-interest/monte-carlo";
import { compoundResultsMatch, monteCarloResultsMatch } from "./compound-parity";

interface WasmExports {
  evaluate_finance_core: (requestJson: string) => string;
  evaluate_finance_core_monte_carlo_paths?: (
    requestJson: string,
  ) => Float64Array;
  default: (input?: RequestInfo | URL) => Promise<unknown>;
}

export interface CompoundWasmEvaluation {
  result: CompoundResult;
  parityVerified: boolean | null;
  engine: "typescript" | "wasm";
}

export interface MonteCarloWasmEvaluation {
  result: MonteCarloResult;
  parityVerified: boolean | null;
  engine: "typescript" | "wasm";
}

function wasmBaseUrl(): string {
  if (typeof self !== "undefined" && "location" in self && self.location?.origin) {
    return `${self.location.origin}/wasm/finance-wasm/`;
  }
  return "/wasm/finance-wasm/";
}

let wasmModulePromise: Promise<WasmExports | null> | null = null;

async function loadWasmModule(): Promise<WasmExports | null> {
  if (wasmModulePromise) return wasmModulePromise;
  wasmModulePromise = (async () => {
    try {
      const base = wasmBaseUrl();
      const mod = (await import(
        /* webpackIgnore: true */ /* @vite-ignore */ `${base}finance_wasm.js`
      )) as WasmExports;
      await mod.default(`${base}finance_wasm_bg.wasm`);
      return mod;
    } catch {
      return null;
    }
  })();
  return wasmModulePromise;
}

function evaluateCompoundWithWasm(
  module: WasmExports,
  params: CompoundParams,
  context: CompoundContext | undefined,
  options: { allMonths?: boolean; asOf?: string },
): CompoundResult {
  const request = {
    schemaVersion: 1,
    cases: [
      {
        operation: "compoundProjection",
        id: "ui",
        params,
        context,
        options,
      },
    ],
  };
  const response = JSON.parse(module.evaluate_finance_core(JSON.stringify(request))) as {
    cases?: Array<{ result?: CompoundResult }>;
    error?: { message: string };
  };
  const result = response.cases?.[0]?.result;
  if (!result) {
    throw new Error(response.error?.message ?? "WASM compound evaluation failed");
  }
  return result;
}

function evaluateMonteCarloWithWasm(
  module: WasmExports,
  params: CompoundParams,
  context: CompoundContext | undefined,
  options: MonteCarloOptions,
): MonteCarloResult {
  const request = {
    schemaVersion: 1,
    cases: [
      {
        operation: "monteCarlo",
        id: "ui",
        params,
        context,
        options,
      },
    ],
  };
  const response = JSON.parse(module.evaluate_finance_core(JSON.stringify(request))) as {
    cases?: Array<{ result?: MonteCarloResult }>;
    error?: { message: string };
  };
  const result = response.cases?.[0]?.result;
  if (!result) {
    throw new Error(response.error?.message ?? "WASM Monte Carlo evaluation failed");
  }
  return result;
}

export async function evaluateCompoundWithOptionalWasm(
  calculateTs: () => CompoundResult,
  params: CompoundParams,
  context: CompoundContext | undefined,
  options: {
    allMonths?: boolean;
    asOf?: string;
    preferWasm?: boolean;
    checkParity?: boolean;
  },
): Promise<CompoundWasmEvaluation> {
  const tsResult = calculateTs();
  if (!options.preferWasm) {
    return { result: tsResult, parityVerified: null, engine: "typescript" };
  }

  const wasm = await loadWasmModule();
  if (!wasm) {
    return {
      result: tsResult,
      parityVerified: options.checkParity ? true : null,
      engine: "typescript",
    };
  }

  try {
    const wasmResult = evaluateCompoundWithWasm(wasm, params, context, options);
    if (!options.checkParity) {
      return { result: wasmResult, parityVerified: null, engine: "wasm" };
    }
    const parityVerified = compoundResultsMatch(tsResult, wasmResult);
    return {
      result: parityVerified ? wasmResult : tsResult,
      parityVerified,
      engine: parityVerified ? "wasm" : "typescript",
    };
  } catch {
    return {
      result: tsResult,
      parityVerified: options.checkParity ? false : null,
      engine: "typescript",
    };
  }
}

export async function evaluateMonteCarloWithOptionalWasm(
  calculateTs: () => MonteCarloResult,
  params: CompoundParams,
  context: CompoundContext | undefined,
  options: MonteCarloOptions & { preferWasm?: boolean; checkParity?: boolean },
): Promise<MonteCarloWasmEvaluation> {
  const tsResult = calculateTs();
  if (!options.preferWasm) {
    return { result: tsResult, parityVerified: null, engine: "typescript" };
  }

  const wasm = await loadWasmModule();
  if (!wasm) {
    return {
      result: tsResult,
      parityVerified: options.checkParity ? true : null,
      engine: "typescript",
    };
  }

  try {
    const wasmResult = evaluateMonteCarloWithWasm(wasm, params, context, options);
    if (!options.checkParity) {
      return { result: wasmResult, parityVerified: null, engine: "wasm" };
    }
    const parityVerified = monteCarloResultsMatch(tsResult, wasmResult);
    return {
      result: parityVerified ? wasmResult : tsResult,
      parityVerified,
      engine: parityVerified ? "wasm" : "typescript",
    };
  } catch {
    return {
      result: tsResult,
      parityVerified: options.checkParity ? false : null,
      engine: "typescript",
    };
  }
}
