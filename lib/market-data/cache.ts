import fs from "node:fs";
import path from "node:path";
import { ensureDataDir } from "../project-paths";
import type { DailyClose } from "./moex-client";

export interface MarketDataCacheFile {
  cacheDate: string;
  fetchedAt: string;
  indices: Record<string, DailyClose[]>;
  fxDates: Record<string, Record<string, number>>;
}

const CACHE_FILE = "market-benchmark-cache.json";

function cachePath(): string {
  return path.join(ensureDataDir(), CACHE_FILE);
}

export function readMarketCache(): MarketDataCacheFile | null {
  const filePath = cachePath();
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as MarketDataCacheFile;
  } catch {
    return null;
  }
}

export function writeMarketCache(cache: MarketDataCacheFile): void {
  fs.writeFileSync(cachePath(), `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

export function isCacheFresh(
  cache: MarketDataCacheFile | null,
): cache is MarketDataCacheFile {
  if (!cache) return false;
  const today = new Date().toISOString().slice(0, 10);
  return cache.cacheDate === today;
}
