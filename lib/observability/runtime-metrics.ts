import {
  emptyLatencyPercentiles,
  emptyStatusBreakdown,
  type ServiceSnapshot,
} from "@/lib/observability/schema";

const startedAt = Date.now();
const httpCounters = { requests: 0, status: emptyStatusBreakdown(), latencySamples: [] as number[] };
const importCounters = { brokerSuccess: 0, brokerFailed: 0 };
const MAX_LATENCY_SAMPLES = 512;

export function recordNodeHttpRequest(status: number, latencyMs: number): void {
  httpCounters.requests += 1;
  if (status >= 200 && status < 300) httpCounters.status["2xx"] += 1;
  else if (status >= 300 && status < 400) httpCounters.status["3xx"] += 1;
  else if (status >= 400 && status < 500) httpCounters.status["4xx"] += 1;
  else httpCounters.status["5xx"] += 1;
  httpCounters.latencySamples.push(latencyMs);
  if (httpCounters.latencySamples.length > MAX_LATENCY_SAMPLES) httpCounters.latencySamples.shift();
}

export function recordBrokerImportOutcome(success: boolean): void {
  if (success) importCounters.brokerSuccess += 1;
  else importCounters.brokerFailed += 1;
}

function percentile(samples: number[], quantile: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

export async function buildNodeHealthSnapshot(): Promise<ServiceSnapshot> {
  const memory = process.memoryUsage();
  const samples = httpCounters.latencySamples;
  const { isCacheFresh, readMarketCache } = await import(
    /* turbopackIgnore: true */ "@/lib/market-data/cache"
  );
  const marketCache = readMarketCache();
  const sizeKb = Math.round(
    Buffer.byteLength(JSON.stringify(marketCache), "utf8") / 1024,
  );
  return {
    uptimeSecs: (Date.now() - startedAt) / 1000,
    memoryRssMb: Math.round((memory.rss / (1024 * 1024)) * 10) / 10,
    heapUsedMb: Math.round((memory.heapUsed / (1024 * 1024)) * 10) / 10,
    http: {
      requests: httpCounters.requests,
      latencyMs: { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), p99: percentile(samples, 0.99) },
      status: { ...httpCounters.status },
    },
    cache: { marketBenchmark: { fresh: isCacheFresh(marketCache), sizeKb } },
    imports: { brokerSuccess: importCounters.brokerSuccess, brokerFailed: importCounters.brokerFailed },
  };
}

export function resetNodeRuntimeMetricsForTests(): void {
  httpCounters.requests = 0;
  httpCounters.status = emptyStatusBreakdown();
  httpCounters.latencySamples = [];
  importCounters.brokerSuccess = 0;
  importCounters.brokerFailed = 0;
}
