import {
  buildBrokerReportDiff,
  snapshotPositionsFromReport,
} from "@/lib/broker-report-diff";
import { parsePortfolioHtml } from "@/lib/parse-portfolio-html";
import fs from "node:fs";
import path from "node:path";
import type { BrokerBalanceSnapshot } from "@/lib/portfolio-types";

describe("broker report diff", () => {
  const fixturePath = path.join(
    process.cwd(),
    "__tests__",
    "fixtures",
    "sber-t1-report.html",
  );

  it("builds position diff between snapshots", () => {
    const html = fs.readFileSync(fixturePath, "utf-8");
    const report = parsePortfolioHtml(html);
    const positions = snapshotPositionsFromReport(report);

    const previous: BrokerBalanceSnapshot = {
      id: "1",
      uploadedAt: "2026-09-01T00:00:00.000Z",
      fileName: "old.html",
      periodStart: "01.08.2026",
      periodEnd: "01.08.2026",
      brokerTotal: 500_000,
      cashRub: 100_000,
      securities: positions.map((position) => ({
        ...position,
        quantity: Math.max(0, position.quantity - 100),
        value: Math.max(0, position.value - 50_000),
      })),
      customAssetsTotal: 0,
      totalDebt: 0,
      grandTotal: 500_000,
      deposits: [],
    };

    const current: BrokerBalanceSnapshot = {
      id: "2",
      uploadedAt: "2026-09-02T00:00:00.000Z",
      fileName: "new.html",
      periodStart: "01.09.2026",
      periodEnd: "01.09.2026",
      brokerTotal: 600_000,
      cashRub: 30,
      securities: positions,
      customAssetsTotal: 0,
      totalDebt: 0,
      grandTotal: 600_000,
      deposits: [{ id: "d1", date: "01.09.2026", amount: 100_000, description: "pop" }],
    };

    const diff = buildBrokerReportDiff(previous, current);
    expect(diff).not.toBeNull();
    expect(diff!.depositsInPeriod).toBe(100_000);
    expect(diff!.positionChanges.length).toBeGreaterThan(0);
    expect(diff!.brokerTotalDelta).toBe(100_000);
  });
});
