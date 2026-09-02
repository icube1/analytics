import type { DailyClose } from "./moex-client";

export interface MarketDataCacheFile {
  cacheDate: string;
  fetchedAt: string;
  indices: Record<string, DailyClose[]>;
  fxDates: Record<string, Record<string, number>>;
}
