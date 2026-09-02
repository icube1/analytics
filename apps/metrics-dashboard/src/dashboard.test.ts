import { describe, expect, it } from "vitest";
import { formatUptime, renderCards } from "./dashboard";

describe("metrics dashboard", () => {
  it("renders cards without financial fields", () => {
    const html = renderCards({
      collectedAt: "2026-09-02T19:00:00.000Z",
      host: { cpuPercent: 10, memoryRssMb: 100, disk: { usedPercent: 40, freeMb: 1000 } },
      services: { nodeApp: { imports: { brokerSuccess: 1, brokerFailed: 0 }, cache: { marketBenchmark: { fresh: true } } } },
    });
    expect(html).toContain("Host CPU");
    expect(html).not.toContain("portfolio");
  });

  it("formats uptime", () => {
    expect(formatUptime(3661)).toBe("1h 1m");
  });
});
