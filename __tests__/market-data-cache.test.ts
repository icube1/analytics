import {
  isCacheFresh,
  readMarketCache,
  resetMarketCacheForTests,
  writeMarketCache,
  type MarketDataCacheFile,
} from "@/lib/market-data/cache";

describe("market data cache", () => {
  afterEach(() => {
    resetMarketCacheForTests();
  });

  it("keeps today's cache in memory without throwing", () => {
    const payload: MarketDataCacheFile = {
      cacheDate: new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
      indices: { IMOEX: [{ date: "2026-07-01", close: 100 }] },
      fxDates: { "2026-07-01": { USD: 90 } },
    };

    expect(() => writeMarketCache(payload)).not.toThrow();

    const cached = readMarketCache();
    expect(isCacheFresh(cached)).toBe(true);
    expect(cached?.indices.IMOEX?.[0]?.close).toBe(100);
    expect(cached?.fxDates["2026-07-01"]?.USD).toBe(90);
  });
});
