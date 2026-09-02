import fs from "node:fs";
import path from "node:path";
import {
  enrichBrokerReport,
  hasPendingSettlements,
  resolveCashPosition,
  resolveSecurityPosition,
  sumEffectiveCashRub,
  sumEffectiveSecuritiesValue,
} from "@/lib/broker-positions";
import { parsePortfolioHtml } from "@/lib/parse-portfolio-html";

describe("broker positions T+1", () => {
  const fixturePath = path.join(
    process.cwd(),
    "__tests__",
    "fixtures",
    "sber-t1-report.html",
  );

  it("uses planned outgoing balance from Sber report", () => {
    const html = fs.readFileSync(fixturePath, "utf-8");
    const report = parsePortfolioHtml(html);

    const gold = report.securities.find((s) => s.name.includes("золото"));
    expect(gold).toBeDefined();
    expect(gold!.quantityEnd).toBe(667);
    expect(gold!.quantityPlanned).toBe(2087);
    expect(gold!.plannedCredits).toBe(1420);

    const resolved = resolveSecurityPosition(gold!);
    expect(resolved.quantity).toBe(2087);
    expect(resolved.pendingQuantity).toBe(1420);
    expect(resolved.hasPendingSettlement).toBe(true);
    expect(resolved.value).toBeCloseTo(2087 * gold!.priceEnd, 0);

    expect(hasPendingSettlements(report)).toBe(true);
    expect(sumEffectiveSecuritiesValue(report)).toBeGreaterThan(
      report.securitiesEnd,
    );

    const rub = report.cash.find((item) => item.currency === "RUB");
    expect(rub?.endPlanned).toBeCloseTo(30.93, 1);
    expect(sumEffectiveCashRub(report)).toBeCloseTo(30.93, 1);
    expect(sumEffectiveCashRub(report)).toBeLessThan(report.cashEnd);
  });

  it("enriches legacy saved report from unsettled trades", () => {
    const html = fs.readFileSync(fixturePath, "utf-8");
    const report = parsePortfolioHtml(html);
    const legacy = {
      ...report,
      securities: report.securities.map((security) => ({
        ...security,
        quantityPlanned: undefined,
        plannedCredits: undefined,
        plannedDebits: undefined,
      })),
      cash: report.cash.map((item) => ({
        ...item,
        plannedCredits: undefined,
        plannedDebits: undefined,
        endPlanned: undefined,
      })),
    };

    const enriched = enrichBrokerReport(legacy);
    const gold = enriched!.securities.find((s) => s.name.includes("золото"));
    expect(gold?.quantityPlanned).toBe(2087);
    expect(resolveSecurityPosition(gold!).quantity).toBe(2087);
    expect(hasPendingSettlements(enriched)).toBe(true);
    expect(sumEffectiveSecuritiesValue(enriched)).toBeGreaterThan(
      report.securitiesEnd,
    );
    expect(sumEffectiveCashRub(enriched)).toBeCloseTo(30.93, 1);
    const rub = enriched!.cash.find((item) => item.currency === "RUB");
    expect(resolveCashPosition(rub!).balance).toBeCloseTo(30.93, 1);
  });

  it("keeps settled quantity when no planned balance differs", () => {
    const position = {
      id: "x",
      name: "Test",
      isin: "RU0000000001",
      currency: "RUB",
      quantityStart: 10,
      quantityEnd: 10,
      priceStart: 100,
      priceEnd: 100,
      valueStart: 1000,
      valueEnd: 1000,
      valueChange: 0,
      quantityPlanned: 10,
    };

    const resolved = resolveSecurityPosition(position);
    expect(resolved.quantity).toBe(10);
    expect(resolved.hasPendingSettlement).toBe(false);
  });
});
