import { combineBrokerReports } from "@/lib/merge-broker-reports";
import type { BrokerReport } from "@/lib/portfolio-types";

function report(overrides: Partial<BrokerReport>): BrokerReport {
  return {
    periodStart: "2026-10-02",
    periodEnd: "2026-10-13",
    createdAt: "2026-10-13",
    investor: "ИНВЕСТОР",
    contract: "S259RFF",
    assetsStart: 0,
    assetsEnd: 0,
    assetsChange: 0,
    securitiesStart: 0,
    securitiesEnd: 0,
    cashStart: 0,
    cashEnd: 0,
    securities: [],
    cash: [],
    trades: [],
    cashFlows: [],
    ...overrides,
  };
}

describe("combineBrokerReports: метаданные счетов", () => {
  it("переносит тип счёта, когда он одинаковый", () => {
    const combined = combineBrokerReports([
      report({ contract: "S259RFF", accountKind: "iis3" }),
      report({ contract: "S260RFF", accountKind: "iis3" }),
    ]);
    expect(combined?.accountKind).toBe("iis3");
  });

  it("не навязывает тип, если счета разные", () => {
    const combined = combineBrokerReports([
      report({ contract: "S259RFF", accountKind: "iis3" }),
      report({ contract: "4259RFF", accountKind: "broker" }),
    ]);
    expect(combined?.accountKind).toBeUndefined();
  });

  it("складывает зачисления на ИИС по всем счетам", () => {
    const combined = combineBrokerReports([
      report({
        contract: "S259RFF",
        deposits: [
          { year: "2026", date: "2026-10-02", amount: 400_000, basis: "Зачисление", limit: "—" },
        ],
      }),
      report({
        contract: "S260RFF",
        deposits: [
          { year: "2026", date: "2026-05-05", amount: 100_000, basis: "Зачисление", limit: "—" },
        ],
      }),
    ]);
    expect(combined?.deposits).toHaveLength(2);
    expect(combined?.deposits?.reduce((sum, item) => sum + item.amount, 0)).toBe(500_000);
  });

  it("агрегирует налоговый блок: доходы, расходы, полосы ставок и убыток", () => {
    const combined = combineBrokerReports([
      report({
        contract: "4259RFF",
        tax: {
          year: "2026",
          rows: [],
          income: 639_891.15,
          expense: 715_094.26,
          realized: -75_203.11,
          rateBands: [{ rate: 0.13, base: 0, tax: 0 }],
          taxDue: 0,
          lossCarry: 76_996.21,
        },
      }),
      report({
        contract: "4258RFF",
        tax: {
          year: "2026",
          rows: [],
          income: 100_000,
          expense: 0,
          realized: 100_000,
          rateBands: [{ rate: 0.13, base: 100_000, tax: 13_000 }],
          taxDue: 13_000,
          lossCarry: 0,
        },
      }),
    ]);

    expect(combined?.tax?.income).toBeCloseTo(739_891.15, 2);
    expect(combined?.tax?.expense).toBeCloseTo(715_094.26, 2);
    expect(combined?.tax?.realized).toBeCloseTo(24_796.89, 2);
    expect(combined?.tax?.rateBands[0].base).toBeCloseTo(100_000, 2);
    expect(combined?.tax?.lossCarry).toBeCloseTo(76_996.21, 2);
  });

  it("возвращает исходный отчёт без агрегации, если счёт один", () => {
    const single = report({ contract: "S259RFF", accountKind: "iis3" });
    expect(combineBrokerReports([single])).toBe(single);
  });
});
