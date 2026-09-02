import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../project-paths";
import type { DailyClose } from "./moex-client";

export interface MarketDataCacheFile {
  cacheDate: string;
  fetchedAt: string;
  indices: Record<string, DailyClose[]>;
  fxDates: Record<string, Record<string, number>>;
}

const CACHE_FILE = "market-benchmark-cache.json";

/** Живёт между запросами в одном serverless-инстансе. */
let memoryCache: MarketDataCacheFile | null = null;

let resolvedCachePath: string | null | undefined;

function candidateCacheDirs(): string[] {
  const dirs = [
    process.env.MARKET_CACHE_DIR,
    getDataDir(),
    path.join("/tmp", "analytics"),
  ];

  return dirs.filter((dir): dir is string => Boolean(dir));
}

function resolveCachePath(): string | null {
  for (const dir of candidateCacheDirs()) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, ".market-cache-write-probe");
      fs.writeFileSync(probe, "ok");
      fs.unlinkSync(probe);
      return path.join(dir, CACHE_FILE);
    } catch {
      continue;
    }
  }
  return null;
}

function cachePath(): string | null {
  if (resolvedCachePath === undefined) {
    resolvedCachePath = resolveCachePath();
  }
  return resolvedCachePath;
}

export function readMarketCache(): MarketDataCacheFile | null {
  if (isCacheFresh(memoryCache)) return memoryCache;

  const filePath = cachePath();
  if (filePath && fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(filePath, "utf-8"),
      ) as MarketDataCacheFile;
      if (isCacheFresh(parsed)) {
        memoryCache = parsed;
        return parsed;
      }
    } catch {
      // ignore corrupt cache file
    }
  }

  return memoryCache;
}

export function writeMarketCache(cache: MarketDataCacheFile): void {
  memoryCache = cache;

  const filePath = cachePath();
  if (!filePath) return;

  try {
    fs.writeFileSync(filePath, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
  } catch {
    // Serverless deployments often have a read-only app dir — memory cache is enough.
  }
}

export function isCacheFresh(
  cache: MarketDataCacheFile | null,
): cache is MarketDataCacheFile {
  if (!cache) return false;
  const today = new Date().toISOString().slice(0, 10);
  return cache.cacheDate === today;
}

/** Только для тестов */
export function resetMarketCacheForTests(): void {
  memoryCache = null;
  resolvedCachePath = undefined;
}
