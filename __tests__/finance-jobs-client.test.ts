import { resolveMonteCarloPlacement, runServerMonteCarlo } from "@/lib/finance-jobs/client";
import { DEFAULT_DOCUMENT } from "@/lib/portfolio-types";

describe("finance jobs client", () => {
  const originalServer = process.env.VITE_SERVER_FINANCE_JOBS;
  const originalHeavy = process.env.VITE_FINANCE_HEAVY;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalServer === undefined) {
      delete process.env.VITE_SERVER_FINANCE_JOBS;
    } else {
      process.env.VITE_SERVER_FINANCE_JOBS = originalServer;
    }
    if (originalHeavy === undefined) {
      delete process.env.VITE_FINANCE_HEAVY;
    } else {
      process.env.VITE_FINANCE_HEAVY = originalHeavy;
    }
    global.fetch = originalFetch;
  });

  it("keeps Monte Carlo local unless server jobs and Pro are both enabled", () => {
    expect(
      resolveMonteCarloPlacement({
        simulations: 800,
        years: 30,
        online: true,
      }),
    ).toBe("local-worker");

    process.env.VITE_SERVER_FINANCE_JOBS = "1";
    process.env.VITE_FINANCE_HEAVY = "1";
    expect(
      resolveMonteCarloPlacement({
        simulations: 800,
        years: 30,
        online: true,
      }),
    ).toBe("server-job");
    expect(
      resolveMonteCarloPlacement({
        simulations: 800,
        years: 30,
        online: true,
        batterySaver: true,
      }),
    ).toBe("local-worker");
  });

  it("returns a completed finance.evaluate cache hit", async () => {
    process.env.VITE_SERVER_FINANCE_JOBS = "1";
    const result = {
      simulations: 8,
      volatilityPercent: 10,
      points: [],
      finalBalance: { p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 },
    };
    global.fetch = jest.fn(async (input) => {
      expect(String(input)).toContain("/api/v1/jobs");
      return new Response(
        JSON.stringify({
          id: "job-1",
          status: "completed",
          result: { cases: [{ result }] },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await expect(
      runServerMonteCarlo({
        params: DEFAULT_DOCUMENT.compoundParams,
        simulations: 8,
        volatilityPercent: 10,
        seed: 3,
        asOf: "2026-01-15T00:00:00.000Z",
      }),
    ).resolves.toEqual(result);
  });

  it("polls until a pending job completes", async () => {
    process.env.VITE_SERVER_FINANCE_JOBS = "1";
    const result = {
      simulations: 8,
      volatilityPercent: 10,
      points: [],
      finalBalance: { p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 },
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "job-2", status: "pending" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "job-2", status: "running" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "job-2",
            status: "completed",
            result: { cases: [{ result }] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    global.fetch = fetchMock as typeof fetch;

    await expect(
      runServerMonteCarlo({
        params: DEFAULT_DOCUMENT.compoundParams,
        simulations: 8,
        volatilityPercent: 10,
        seed: 3,
        asOf: "2026-01-15",
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails closed when enqueue is rejected", async () => {
    global.fetch = jest.fn(async () => new Response("nope", { status: 403 })) as typeof fetch;
    await expect(
      runServerMonteCarlo({
        params: DEFAULT_DOCUMENT.compoundParams,
        simulations: 8,
        volatilityPercent: 10,
        seed: 3,
        asOf: "2026-01-15",
      }),
    ).rejects.toThrow(/enqueue failed/);
  });
});
