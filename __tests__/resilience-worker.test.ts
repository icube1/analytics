import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateResiliencePlan } from "@/lib/resilience-plan";
import {
  createResilienceWorkerRequest,
  evaluateResiliencePlanDirect,
  startResilienceWorkerJob,
  ResilienceWorkerCancelledError,
  type ResilienceWorkerPort,
} from "@/lib/finance-worker/resilience-client";
import { handleResilienceWorkerRequest } from "@/lib/finance-worker/resilience-worker-handler";

const fixturePath = resolve("fixtures/finance-core/resilience-v1.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  cases: Array<{ input: Parameters<typeof evaluateResiliencePlan>[0] }>;
};

describe("resilience worker handler", () => {
  it("returns a TS plan for valid requests without WASM", async () => {
    const input = fixture.cases[0].input;
    const response = await handleResilienceWorkerRequest(
      createResilienceWorkerRequest(input, {
        preferWasm: false,
        checkParity: false,
      }),
    );

    expect(response.type).toBe("resilience.result");
    if (response.type !== "resilience.result") return;

    expect(response.payload.engine).toBe("typescript");
    expect(response.payload.plan).toEqual(evaluateResiliencePlan(input));
  });

  it("rejects malformed requests", async () => {
    const response = await handleResilienceWorkerRequest({ type: "bad" });
    expect(response.type).toBe("resilience.error");
  });
});

describe("resilience worker client", () => {
  it("cancels in-flight jobs", async () => {
    const input = fixture.cases[0].input;
    const worker = {
      postMessage: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      terminate: jest.fn(),
    } as unknown as ResilienceWorkerPort;

    const request = createResilienceWorkerRequest(input, {
      preferWasm: false,
      checkParity: false,
    });
    const job = startResilienceWorkerJob(worker, request);
    job.cancel();

    await expect(job.promise).rejects.toBeInstanceOf(
      ResilienceWorkerCancelledError,
    );
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("evaluates directly without a worker", async () => {
    const input = fixture.cases[1].input;
    const result = await evaluateResiliencePlanDirect(input, {
      preferWasm: false,
      checkParity: false,
    });
    expect(result.plan.stress).toHaveLength(5);
    expect(result.engine).toBe("typescript");
  });
});
