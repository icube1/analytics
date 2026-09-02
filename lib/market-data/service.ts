import {
  ALL_BENCHMARKS,
  CBR_BENCHMARKS,
  MOEX_BENCHMARKS,
  type BenchmarkDefinition,
} from "./indices-catalog";
import { fetchCbrRatesOnDate, fxReturnPct } from "./cbr-client";
import {
  fetchMoexIndexCloses,
  returnPctFromCloses,
  type DailyClose,
} from "./moex-client";
import type { MarketDataCacheFile } from "./cache-types";

export interface MarketBenchmarkResponse {
  fromDate: string;
  toDate: string;
  cachedAt: string;
  rows: Array<{
    id: string;
    label: string;
    group: BenchmarkDefinition["group"];
    returnPct: number | null;
  }>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultHistoryFrom(toDate: string): string {
  const date = new Date(toDate);
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

async function ensureIndexSeries(
  cache: MarketDataCacheFile,
  secid: string,
  from: string,
  till: string,
): Promise<DailyClose[]> {
  const existing = cache.indices[secid] ?? [];
  const merged = mergeCloses(existing, []);
  const minDate = merged[0]?.date ?? from;
  const maxDate = merged[merged.length - 1]?.date ?? till;

  if (minDate <= from && maxDate >= till && merged.length > 0) {
    return merged;
  }

  const fetched = await fetchMoexIndexCloses(
    secid,
    minDate < from ? minDate : defaultHistoryFrom(till),
    till,
  );
  const series = mergeCloses(existing, fetched);
  cache.indices[secid] = series;
  return series;
}

function mergeCloses(a: DailyClose[], b: DailyClose[]): DailyClose[] {
  const byDate = new Map<string, number>();
  for (const point of [...a, ...b]) {
    byDate.set(point.date, point.close);
  }
  return [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function ensureFxRates(
  cache: MarketDataCacheFile,
  dateIso: string,
): Promise<Record<string, number>> {
  if (cache.fxDates[dateIso]) return cache.fxDates[dateIso];

  const parsed = await fetchCbrRatesOnDate(new Date(dateIso));
  if (!parsed) return {};

  cache.fxDates[parsed.date] = parsed.rates;
  if (parsed.date !== dateIso) {
    cache.fxDates[dateIso] = parsed.rates;
  }
  return parsed.rates;
}

export async function getMarketBenchmarkReturns(
  fromDate: string,
  toDate: string,
): Promise<MarketBenchmarkResponse> {
  const { isCacheFresh, readMarketCache, writeMarketCache } = await import(
    /* turbopackIgnore: true */ "./cache"
  );

  const existing = readMarketCache();
  const cache: MarketDataCacheFile = isCacheFresh(existing)
    ? existing
    : {
        cacheDate: todayIso(),
        fetchedAt: new Date().toISOString(),
        indices: {},
        fxDates: {},
      };

  const rows: MarketBenchmarkResponse["rows"] = [];

  await Promise.all(
    MOEX_BENCHMARKS.map(async (benchmark) => {
      try {
        const series = await ensureIndexSeries(
          cache,
          benchmark.id,
          fromDate,
          toDate,
        );
        rows.push({
          id: benchmark.id,
          label: benchmark.label,
          group: benchmark.group,
          returnPct: returnPctFromCloses(series, fromDate, toDate),
        });
      } catch {
        rows.push({
          id: benchmark.id,
          label: benchmark.label,
          group: benchmark.group,
          returnPct: null,
        });
      }
    }),
  );

  const startRates = await ensureFxRates(cache, fromDate);
  const endRates = await ensureFxRates(cache, toDate);

  for (const benchmark of CBR_BENCHMARKS) {
    const code = benchmark.currencyCode ?? benchmark.id;
    rows.push({
      id: benchmark.id,
      label: benchmark.label,
      group: benchmark.group,
      returnPct: fxReturnPct(startRates[code], endRates[code]),
    });
  }

  writeMarketCache(cache);

  return {
    fromDate,
    toDate,
    cachedAt: cache.fetchedAt,
    rows: rows.sort((a, b) => {
      const order = ALL_BENCHMARKS.findIndex((item) => item.id === a.id);
      const orderB = ALL_BENCHMARKS.findIndex((item) => item.id === b.id);
      return order - orderB;
    }),
  };
}
