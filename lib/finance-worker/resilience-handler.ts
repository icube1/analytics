import {
  evaluateResiliencePlan,
  type ResilienceInput,
  type ResiliencePlan,
} from "../resilience-plan";
import { resiliencePlansMatch } from "../resilience-parity";
import type { ResilienceEvaluationResult } from "./resilience-contract";

interface WasmExports {
  evaluate_finance_core: (requestJson: string) => string;
  default: (input?: RequestInfo | URL) => Promise<unknown>;
}

type WasmModuleState =
  | { status: "idle" }
  | { status: "loading"; promise: Promise<WasmExports | null> }
  | { status: "ready"; module: WasmExports }
  | { status: "failed" };

let wasmState: WasmModuleState = { status: "idle" };

function wasmBaseUrl(): string {
  if (typeof self !== "undefined" && "location" in self && self.location?.origin) {
    return `${self.location.origin}/wasm/finance-wasm/`;
  }
  return "/wasm/finance-wasm/";
}

async function loadWasmModule(): Promise<WasmExports | null> {
  if (wasmState.status === "ready") {
    return wasmState.module;
  }
  if (wasmState.status === "failed") {
    return null;
  }
  if (wasmState.status === "loading") {
    return wasmState.promise;
  }

  const promise = (async () => {
    try {
      const base = wasmBaseUrl();
      const mod = (await import(
        /* webpackIgnore: true */ /* @vite-ignore */ `${base}finance_wasm.js`
      )) as WasmExports;
      await mod.default(`${base}finance_wasm_bg.wasm`);
      wasmState = { status: "ready", module: mod };
      return mod;
    } catch {
      wasmState = { status: "failed" };
      return null;
    }
  })();

  wasmState = { status: "loading", promise };
  return promise;
}

interface WasmBatchResponse {
  schemaVersion?: number;
  error?: { code: string; message: string };
  cases?: Array<{
    operation?: string;
    id?: string;
    plan?: ResiliencePlan;
  }>;
}

function evaluateWithWasm(
  module: WasmExports,
  input: ResilienceInput,
): ResiliencePlan {
  const request = {
    schemaVersion: 1,
    cases: [
      {
        operation: "resiliencePlan",
        id: "ui",
        input,
      },
    ],
  };
  const responseJson = module.evaluate_finance_core(JSON.stringify(request));
  const parsed = JSON.parse(responseJson) as WasmBatchResponse;

  if (parsed.error) {
    throw new Error(parsed.error.message || "WASM evaluation failed");
  }

  const plan = parsed.cases?.[0]?.plan;
  if (!plan) {
    throw new Error("WASM response did not include a resilience plan");
  }

  return plan;
}

export async function evaluateResiliencePlanInWorker(
  input: ResilienceInput,
  options: { preferWasm: boolean; checkParity: boolean },
): Promise<ResilienceEvaluationResult> {
  const tsPlan = evaluateResiliencePlan(input);

  if (!options.preferWasm) {
    return {
      plan: tsPlan,
      engine: "typescript",
      parityVerified: options.checkParity ? true : null,
    };
  }

  const wasmModule = await loadWasmModule();
  if (!wasmModule) {
    return {
      plan: tsPlan,
      engine: "typescript",
      parityVerified: options.checkParity ? true : null,
    };
  }

  const wasmPlan = evaluateWithWasm(wasmModule, input);

  if (options.checkParity) {
    const parityVerified = resiliencePlansMatch(tsPlan, wasmPlan);
    if (!parityVerified) {
      throw new Error("TypeScript and WASM resilience plans diverged");
    }
    return {
      plan: wasmPlan,
      engine: "wasm",
      parityVerified: true,
    };
  }

  return {
    plan: wasmPlan,
    engine: "wasm",
    parityVerified: null,
  };
}

export function resetWasmModuleStateForTests(): void {
  wasmState = { status: "idle" };
}
