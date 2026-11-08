import { computePortfolioAnalytics } from "@/lib/portfolio-analytics";
import { DEFAULT_CUSTOM_ASSETS, type BrokerReport } from "@/lib/portfolio-types";

function report(): BrokerReport {
  return {
    periodStart: "02.10.2026",
    periodEnd: "13.10.2026",
    createdAt: "13.10.2026",
    investor: "ИНВЕСТОР",
    contract: "S259RFF",
    assetsStart: 0,
    assetsEnd: 1_000_000,
    assetsChange: 1_000_000,
    securitiesStart: 0,
    securitiesEnd: 1_000_000,
    cashStart: 0,
    cashEnd: 0,
    securities: [
      {
        id: "1",
        name: "Роснефть",
        isin: "RU000A0J2Q06",
        currency: "RUB",
        quantityStart: 0,
        quantityEnd: 1000,
        priceStart: 0,
        priceEnd: 1000,
        valueStart: 0,
        valueEnd: 1_000_000,
        valueChange: 1_000_000,
      },
    ],
    cash: [],
    trades: [],
    cashFlows: [],
  };
}

describe("computePortfolioAnalytics: источники дохода", () => {
  it("делит доход акций на рост и дивиденды, сохраняя итог 16%", () => {
    const analytics = computePortfolioAnalytics(report(), {
      ...DEFAULT_CUSTOM_ASSETS,
      items: [],
      otherDebts: [],
    });

    const stocks = analytics.slices.find((slice) => slice.id === "stocks");
    expect(stocks).toBeDefined();
    expect(stocks!.assumedReturn).toBeCloseTo(16, 5);
    expect(stocks!.capitalReturn).toBeCloseTo(10, 5);
    expect(stocks!.incomeReturn).toBeCloseTo(6, 5);
    // 1 000 000 ₽ → 100 000 роста и 60 000 дивидендов
    expect(stocks!.expectedReturnRub).toBeCloseTo(160_000, 2);
  });

  it("считает проценты по кэшу денежным доходом, а не ростом", () => {
    const withCash = report();
    withCash.securities = [];
    withCash.securitiesEnd = 0;
    withCash.cashEnd = 500_000;
    withCash.cash = [
      {
        platform: "Основной рынок",
        currency: "RUB",
        rateEnd: 1,
        start: 0,
        end: 500_000,
        change: 500_000,
      },
    ];

    const analytics = computePortfolioAnalytics(withCash, {
      ...DEFAULT_CUSTOM_ASSETS,
      items: [],
      otherDebts: [],
    });
    const cash = analytics.slices.find((slice) => slice.id === "cash");
    expect(cash).toBeDefined();
    expect(cash!.capitalReturn).toBe(0);
    expect(cash!.incomeReturn).toBeCloseTo(8, 5);
  });

  it("сумма доходов по активам равна ожидаемому годовому доходу", () => {
    const analytics = computePortfolioAnalytics(report(), {
      ...DEFAULT_CUSTOM_ASSETS,
      items: [],
      otherDebts: [],
    });
    const sum = analytics.slices.reduce(
      (total, slice) => total + slice.expectedReturnRub,
      0,
    );
    expect(sum).toBeCloseTo(analytics.expectedAnnualIncome, 0);
  });
});
