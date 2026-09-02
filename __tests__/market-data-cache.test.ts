import {
  getMarketCachePathForTests,
  isCacheFresh,
  readMarketCache,
  resetMarketCacheForTests,
  writeMarketCache,
  type MarketDataCacheFile,
} from "@/lib/market-data/cache";

describe("market data cache", () => {
  const originalEnv = {
    VERCEL: process.env.VERCEL,
    AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
    NETLIFY: process.env.NETLIFY,
    MARKET_CACHE_DIR: process.env.MARKET_CACHE_DIR,
  };

  afterEach(() => {
    resetMarketCacheForTests();
    process.env.VERCEL = originalEnv.VERCEL;
    process.env.AWS_LAMBDA_FUNCTION_NAME = originalEnv.AWS_LAMBDA_FUNCTION_NAME;
    process.env.NETLIFY = originalEnv.NETLIFY;
    if (originalEnv.MARKET_CACHE_DIR === undefined) {
      delete process.env.MARKET_CACHE_DIR;
    } else {
      process.env.MARKET_CACHE_DIR = originalEnv.MARKET_CACHE_DIR;
    }
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

  it("does not use project data dir on Vercel", () => {
    process.env.VERCEL = "1";
    delete process.env.MARKET_CACHE_DIR;
    resetMarketCacheForTests();

    const payload: MarketDataCacheFile = {
      cacheDate: new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
      indices: {},
      fxDates: {},
    };

    expect(() => writeMarketCache(payload)).not.toThrow();

    const cachePath = getMarketCachePathForTests();
    expect(cachePath).not.toBeNull();
    expect(cachePath).toContain("/tmp/");
    expect(cachePath).not.toContain("/data/");
  });
});
