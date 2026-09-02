import {
  createMonteCarloWorkerRequest,
  FinanceWorkerCancelledError,
  type FinanceWorkerPort,
  startMonteCarloWorkerJob,
} from "@/lib/finance-worker/client";
import { FINANCE_WORKER_PROTOCOL_VERSION } from "@/lib/finance-worker/contract";
import { DEFAULT_COMPOUND_PARAMS } from "@/lib/portfolio-types";

class FakeWorker implements FinanceWorkerPort {
  request = createMonteCarloWorkerRequest({
    params: DEFAULT_COMPOUND_PARAMS,
    options: {
      simulations: 50,
      volatilityPercent: 18,
      seed: 42,
      asOf: "2026-01-15T00:00:00.000Z",
    },
  });
  terminated = false;
  private messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

  postMessage(request: typeof this.request): void {
    this.request = request;
  }

  addEventListener(
    type: "message" | "error",
    listener:
      | ((event: MessageEvent<unknown>) => void)
      | ((event: ErrorEvent) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.add(
        listener as (event: MessageEvent<unknown>) => void,
      );
    } else {
      this.errorListeners.add(listener as (event: ErrorEvent) => void);
    }
  }

  removeEventListener(
    type: "message" | "error",
    listener:
      | ((event: MessageEvent<unknown>) => void)
      | ((event: ErrorEvent) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.delete(
        listener as (event: MessageEvent<unknown>) => void,
      );
    } else {
      this.errorListeners.delete(listener as (event: ErrorEvent) => void);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    const event = { data } as MessageEvent<unknown>;
    this.messageListeners.forEach((listener) => listener(event));
  }
}

describe("finance worker client", () => {
  it("terminates and rejects an active calculation when cancelled", async () => {
    const worker = new FakeWorker();
    const job = startMonteCarloWorkerJob(worker, worker.request);
    const rejection = job.promise.catch((error: unknown) => error);

    job.cancel();

    await expect(rejection).resolves.toBeInstanceOf(
      FinanceWorkerCancelledError,
    );
    expect(worker.terminated).toBe(true);
  });

  it("ignores stale responses and accepts only the active request", async () => {
    const worker = new FakeWorker();
    const job = startMonteCarloWorkerJob(worker, worker.request);
    let settled = false;
    void job.promise.finally(() => {
      settled = true;
    });

    worker.emit({
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId: "older-request",
      type: "monte-carlo.result",
      payload: { stale: true },
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    const expected = {
      simulations: 50,
      volatilityPercent: 18,
      points: [],
      finalBalance: { p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 },
    };
    worker.emit({
      version: FINANCE_WORKER_PROTOCOL_VERSION,
      requestId: worker.request.requestId,
      type: "monte-carlo.result",
      payload: expected,
    });

    await expect(job.promise).resolves.toEqual(expected);
    expect(worker.terminated).toBe(true);
  });
});
