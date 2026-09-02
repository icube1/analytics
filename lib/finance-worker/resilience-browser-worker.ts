import type { ResilienceWorkerPort } from "./resilience-client";

export function createResilienceWorker(): ResilienceWorkerPort {
  return new Worker(new URL("./resilience.worker.ts", import.meta.url), {
    type: "module",
    name: "resilience-calculations",
  });
}
