import { summarizeAccount, summarizePortfolio } from "@/lib/account-summary";
import type { BrokerAccountSource, BrokerReport } from "@/lib/portfolio-types";

function report(overrides: Partial<BrokerReport> = {}): BrokerReport {
  return {
    periodStart: "2026-09-09",
    periodEnd: "2026-10-13",
    createdAt: "2026-10-13",
    investor: "ИНВЕСТОР",
    contract: "S259RFF",
    assetsStart: 0,
    assetsEnd: 427_490.83,
    assetsChange: 427_490.83,
    securitiesStart: 0,
    securitiesEnd: 426_430.9,
    cashStart: 0,
    cashEnd: 1_059.93,
    securities: [],
    cash: [],
    trades: [],
    cashFlows: [],
    ...overrides,
  };
}

function account(overrides: Partial<BrokerAccountSource> = {}): BrokerAccountSource {
  return {
    id: "acc-1",
    fileName: "S259RFF.html",
    uploadedAt: "2026-10-13T10:00:00.000Z",
    report: report(),
    ...overrides,
  };
}

describe("summarizeAccount", () => {
  it("computes market value, invested amount and pnl for an IIS account", () => {
    const summary = summarizeAccount(
      account({
        kind: "iis3",
        label: "ИИС-3 Сбер",
        report: report({
          securities: [
            {
              id: "1",
              name: "Газпром нефть",
              isin: "RU0009062467",
              currency: "RUB",
              quantityStart: 0,
              quantityEnd: 181,
              priceStart: 0,
              priceEnd: 633.9,
              valueStart: 0,
              valueEnd: 114_735.9,
              valueChange: 114_735.9,
            },
            {
              id: "2",
              name: "НоваБев Групп",
              isin: "RU000A0HL5M1",
              currency: "RUB",
              quantityStart: 0,
              quantityEnd: 410,
              priceStart: 0,
              priceEnd: 259,
              valueStart: 0,
              valueEnd: 311_695,
              valueChange: 311_695,
            },
          ],
          cash: [{ platform: "Основной рынок", currency: "RUB", rateEnd: 1, start: 0, end: 1_059.93, change: 1_059.93 }],
          deposits: [
            { year: "2026", date: "2026-10-02", amount: 400_000, basis: "Зачисление д/с на ИИС", limit: "Ограничений нет" },
          ],
        }),
      }),
    );

    expect(summary.kind).toBe("iis3");
    expect(summary.marketValue).toBeCloseTo(427_490.83, 2);
    expect(summary.invested).toBeCloseTo(400_000, 2);
    expect(summary.pnl).toBeCloseTo(27_490.83, 2);
    expect(summary.depositsFromReport).toBe(true);
    expect(summary.xirr).not.toBeNull();
    expect(summary.xirr!).toBeGreaterThan(0);
    // История 11 дней → XIRR не считается надёжным
    expect(summary.xirrReliable).toBe(false);
  });

  it("keeps realized result of an empty account with a tax block", () => {
    const summary = summarizeAccount(
      account({
        id: "acc-2",
        kind: "broker",
        report: report({
          contract: "4259RFF",
          assetsEnd: 0,
          securitiesEnd: 0,
          cashEnd: 0,
          tax: {
            year: "2026",
            rows: [],
            income: 639_891.15,
            expense: 715_094.26,
            realized: -75_203.11,
            rateBands: [],
            taxDue: 0,
            lossCarry: -75_203.11,
          },
        }),
      }),
    );

    expect(summary.marketValue).toBe(0);
    expect(summary.realized).toBeCloseTo(-75_203.11, 2);
    expect(summary.pnl).toBe(0);
  });

  it("falls back to cash-flow deposits when the IIS table is absent", () => {
    const summary = summarizeAccount(
      account({
        report: report({
          cashFlows: [
            { id: "1", date: "2026-10-02", description: "Зачисление д/с", currency: "RUB", credit: 400_000, debit: 0 },
            { id: "2", date: "2026-10-02", description: "Сделка от 02.10.2026", currency: "RUB", credit: 0, debit: 398_386.49 },
          ],
        }),
      }),
    );

    expect(summary.invested).toBeCloseTo(400_000, 2);
    expect(summary.depositsFromReport).toBe(false);
  });
});

describe("summarizePortfolio", () => {
  it("sums accounts and builds allocations", () => {
    const totals = summarizePortfolio([
      account({
        kind: "iis3",
        report: report({
          securities: [
            {
              id: "1",
              name: "Роснефть",
              isin: "RU000A0J2Q06",
              currency: "RUB",
              quantityStart: 0,
              quantityEnd: 294,
              priceStart: 0,
              priceEnd: 377.95,
              valueStart: 0,
              valueEnd: 111_117.3,
              valueChange: 111_117.3,
            },
          ],
          cash: [{ platform: "Основной рынок", currency: "RUB", rateEnd: 1, start: 0, end: 1_059.93, change: 1_059.93 }],
          deposits: [{ year: "2026", date: "2026-10-02", amount: 400_000, basis: "Зачисление", limit: "—" }],
        }),
      }),
      account({
        id: "acc-2",
        kind: "broker",
        report: report({ contract: "4259RFF", assetsEnd: 0, securitiesEnd: 0, cashEnd: 0, securities: [], cash: [] }),
      }),
    ]);

    expect(totals.accounts).toHaveLength(2);
    expect(totals.marketValue).toBeCloseTo(112_177.23, 2);
    expect(totals.invested).toBeCloseTo(400_000, 2);
    expect(totals.allocationByAccount[0].share).toBeCloseTo(1, 5);
    expect(totals.allocationByTicker[0].ticker).toBe("RU000A0J2Q06");
    expect(totals.xirrReliable).toBe(false);
  });

  it("picks the latest periodEnd by date even when formats are mixed", () => {
    const totals = summarizePortfolio([
      account({
        id: "legacy",
        report: report({
          contract: "4245FJE",
          periodStart: "2026-06-01",
          periodEnd: "2026-06-01",
          securities: [],
          cash: [{ platform: "Основной рынок", currency: "RUB", rateEnd: 1, start: 0, end: 1000, change: 1000 }],
        }),
      }),
      account({
        kind: "iis3",
        report: report({
          periodEnd: "13.10.2026",
          cash: [{ platform: "Основной рынок", currency: "RUB", rateEnd: 1, start: 0, end: 1_059.93, change: 1_059.93 }],
          securities: [
            {
              id: "1",
              name: "ФосАгро",
              isin: "RU000A0JRKT8",
              currency: "RUB",
              quantityStart: 0,
              quantityEnd: 17,
              priceStart: 0,
              priceEnd: 5320,
              valueStart: 0,
              valueEnd: 90_440,
              valueChange: 90_440,
            },
          ],
          deposits: [{ year: "2026", date: "02.10.2026", amount: 80_000, basis: "Зачисление", limit: "—" }],
        }),
      }),
    ]);

    expect(totals.xirr).not.toBeNull();
    expect(totals.xirr!).toBeGreaterThan(0);
  });
});
