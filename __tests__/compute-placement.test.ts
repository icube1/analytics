import {
  chooseComputePlacement,
  detectComputeEnvironment,
} from "@/lib/compute-placement";
import { parseCivilDate, toCivilDateString } from "@/lib/civil-date";

describe("compute placement", () => {
  it("keeps calculations on the local Worker by default", () => {
    expect(
      chooseComputePlacement({
        kind: "monteCarlo",
        simulations: 1000,
        horizonMonths: 360,
      }),
    ).toBe("local-worker");
  });

  it("routes heavy Monte Carlo to a server job only when explicitly enabled", () => {
    expect(
      chooseComputePlacement({
        kind: "monteCarlo",
        simulations: 500,
        online: true,
        serverJobsEnabled: true,
        heavyEntitled: true,
      }),
    ).toBe("server-job");
    expect(
      chooseComputePlacement({
        kind: "compound",
        horizonMonths: 360,
        online: true,
        serverJobsEnabled: true,
        heavyEntitled: true,
      }),
    ).toBe("local-worker");
    expect(
      chooseComputePlacement({
        kind: "monteCarlo",
        simulations: 500,
        online: true,
        serverJobsEnabled: true,
        heavyEntitled: true,
        batterySaver: true,
      }),
    ).toBe("local-worker");
  });
});

describe("compute environment", () => {
  it("reads only connectivity hints and never enables server jobs by itself", () => {
    const env = detectComputeEnvironment();
    expect(typeof env.online).toBe("boolean");
    expect(env.batterySaver).toBe(false);
    expect(
      chooseComputePlacement({
        kind: "monteCarlo",
        simulations: 800,
        horizonMonths: 360,
        online: env.online,
      }),
    ).toBe("local-worker");
  });
});

describe("civil dates", () => {
  it("strips timestamps before sending dates to finance-core", () => {
    expect(toCivilDateString("2026-07-19T21:00:00.000Z")).toBe("2026-07-19");
    expect(toCivilDateString("2026-07-19")).toBe("2026-07-19");
    expect(toCivilDateString("not-a-date")).toBeUndefined();
  });

  it("parses YYYY-MM-DD as a local civil date", () => {
    const date = parseCivilDate("2026-07-19");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(19);
  });
});
