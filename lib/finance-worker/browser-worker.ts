import type { FinanceWorkerPort } from "./client";

export function createFinanceWorker(): FinanceWorkerPort {
  return new Worker(new URL("./finance.worker.ts", import.meta.url), {
    type: "module",
    name: "finance-calculations",
  });
}
