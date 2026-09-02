import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  HostSnapshot,
  LatencyPercentiles,
  NginxSnapshot,
  ObservabilitySnapshot,
  ServiceSnapshot,
  StatusBreakdown,
} from "../../lib/observability/schema";
import { OBSERVABILITY_SCHEMA_VERSION } from "../../lib/observability/schema";

export type CollectorConfig = {
  dataDir: string;
  nginxLogPath: string;
  financeApiUrl: string;
  nodeHealthUrl: string;
  authHeader?: string;
  maxSamples: number;
  maxJsonlBytes: number;
  windowSecs: number;
};

export function defaultCollectorConfig(): CollectorConfig {
  return {
    dataDir: process.env.OBSERVABILITY_DATA_DIR ?? path.join(process.cwd(), "data", "observability"),
    nginxLogPath: process.env.OBSERVABILITY_NGINX_LOG ?? "/var/log/nginx/analytics-timing.log",
    financeApiUrl: process.env.OBSERVABILITY_FINANCE_API_URL ?? "http://127.0.0.1:8080/internal/metrics",
    nodeHealthUrl: process.env.OBSERVABILITY_NODE_HEALTH_URL ?? "http://127.0.0.1:3000/api/internal/health",
    authHeader: process.env.OBSERVABILITY_AUTH_HEADER,
    maxSamples: Number(process.env.OBSERVABILITY_MAX_SAMPLES ?? 10_080),
    maxJsonlBytes: Number(process.env.OBSERVABILITY_MAX_JSONL_BYTES ?? 5_242_880),
    windowSecs: Number(process.env.OBSERVABILITY_WINDOW_SECS ?? 300),
  };
}

export function readHostSnapshot(): HostSnapshot {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const diskPath = process.env.OBSERVABILITY_DISK_PATH ?? "/";
  let disk = { usedPercent: 0, freeMb: 0 };
  try {
    const stats = fs.statfsSync(diskPath);
    const totalBytes = Number(stats.bsize) * Number(stats.blocks);
    const freeBytes = Number(stats.bsize) * Number(stats.bfree);
    disk = {
      usedPercent: totalBytes === 0 ? 0 : Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10,
      freeMb: Math.round(freeBytes / (1024 * 1024)),
    };
  } catch { /* ignore */ }
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
  }
  return {
    cpuPercent: total === 0 ? 0 : Math.round(((total - idle) / total) * 1000) / 10,
    memoryRssMb: Math.round(((totalMem - freeMem) / (1024 * 1024)) * 10) / 10,
    load1: os.loadavg()[0] ?? 0,
    disk,
  };
}

export function parseNginxTimingLine(line: string): { timestampMs: number; status: number; requestTimeMs: number } | null {
  try {
    const row = JSON.parse(line) as { time?: string; status?: number; request_time?: number };
    if (row.time && typeof row.status === "number") {
      const timestampMs = Date.parse(row.time);
      if (!Number.isNaN(timestampMs)) {
        return { timestampMs, status: row.status, requestTimeMs: Number(row.request_time ?? 0) * 1000 };
      }
    }
  } catch { /* legacy */ }
  return null;
}

export function parseNginxTimingLog(content: string, windowSecs: number): NginxSnapshot | undefined {
  const cutoff = Date.now() - windowSecs * 1000;
  const latencies: number[] = [];
  const status: StatusBreakdown = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  for (const line of content.split("\n")) {
    const parsed = parseNginxTimingLine(line.trim());
    if (!parsed || parsed.timestampMs < cutoff) continue;
    latencies.push(parsed.requestTimeMs);
    if (parsed.status >= 200 && parsed.status < 300) status["2xx"] += 1;
    else if (parsed.status >= 300 && parsed.status < 400) status["3xx"] += 1;
    else if (parsed.status >= 400 && parsed.status < 500) status["4xx"] += 1;
    else status["5xx"] += 1;
  }
  if (latencies.length === 0) return undefined;
  const sorted = [...latencies].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)] ?? 0;
  return { windowSecs, requests: latencies.length, latencyMs: { p50: pick(0.5), p95: pick(0.95), p99: pick(0.99) }, status };
}

export async function fetchServiceSnapshot(url: string, authHeader?: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { headers: authHeader ? { authorization: authHeader } : undefined, signal: AbortSignal.timeout(5_000) });
    return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function collectSnapshot(config: CollectorConfig = defaultCollectorConfig()): Promise<ObservabilitySnapshot> {
  const [financeApi, nodeApp] = await Promise.all([
    fetchServiceSnapshot(config.financeApiUrl, config.authHeader),
    fetchServiceSnapshot(config.nodeHealthUrl, config.authHeader),
  ]);
  let nginx: NginxSnapshot | undefined;
  try {
    nginx = parseNginxTimingLog(fs.readFileSync(config.nginxLogPath, "utf-8"), config.windowSecs);
  } catch { nginx = undefined; }
  return {
    schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
    collectedAt: new Date().toISOString(),
    host: readHostSnapshot(),
    nginx,
    services: {
      financeApi: financeApi ? mapFinanceApi(financeApi) : undefined,
      nodeApp: nodeApp ? mapNode(nodeApp) : undefined,
    },
  };
}

function mapFinanceApi(payload: Record<string, unknown>): ObservabilitySnapshot["services"]["financeApi"] {
  const http = payload.http as Record<string, unknown>;
  const status = http.status as StatusBreakdown;
  const latency = http.latency_ms as LatencyPercentiles;
  const jobs = payload.jobs as Record<string, unknown>;
  const database = payload.database as Record<string, unknown>;
  return {
    uptimeSecs: Number(payload.uptime_secs ?? 0),
    memoryRssMb: payload.memory_rss_mb ? Number(payload.memory_rss_mb) : undefined,
    http: { requests: Number(http.requests ?? 0), latencyMs: latency, status },
    jobs: {
      pending: Number(jobs.pending ?? 0),
      running: Number(jobs.running ?? 0),
      failed: Number(jobs.failed ?? 0),
      completed: Number(jobs.completed ?? 0),
      byKind: Object.fromEntries(((jobs.by_kind as Array<{ kind: string; count: number }> | undefined) ?? []).map((e) => [e.kind, e.count])),
    },
    database: { ok: Boolean(database.ok), poolSize: Number(database.pool_size ?? 0), poolIdle: Number(database.pool_idle ?? 0) },
  };
}

function mapNode(payload: Record<string, unknown>): ObservabilitySnapshot["services"]["nodeApp"] {
  const http = payload.http as Record<string, unknown>;
  return {
    uptimeSecs: Number(payload.uptimeSecs ?? 0),
    memoryRssMb: payload.memoryRssMb ? Number(payload.memoryRssMb) : undefined,
    heapUsedMb: payload.heapUsedMb ? Number(payload.heapUsedMb) : undefined,
    http: { requests: Number(http.requests ?? 0), latencyMs: http.latencyMs as LatencyPercentiles, status: http.status as StatusBreakdown },
    cache: payload.cache as ServiceSnapshot["cache"],
    imports: payload.imports as ServiceSnapshot["imports"],
  };
}

export function appendSample(config: CollectorConfig, snapshot: ObservabilitySnapshot): { jsonlPath: string; latestPath: string } {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const day = snapshot.collectedAt.slice(0, 10);
  const jsonlPath = path.join(config.dataDir, `samples-${day}.jsonl`);
  const latestPath = path.join(config.dataDir, "latest.json");
  fs.appendFileSync(jsonlPath, `${JSON.stringify(snapshot)}\n`, "utf-8");
  fs.writeFileSync(latestPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  const lines = fs.readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean);
  if (lines.length > config.maxSamples) fs.writeFileSync(jsonlPath, `${lines.slice(-config.maxSamples).join("\n")}\n`, "utf-8");
  if (fs.statSync(jsonlPath).size > config.maxJsonlBytes) fs.writeFileSync(jsonlPath, `${lines.slice(-config.maxSamples).join("\n")}\n`, "utf-8");
  return { jsonlPath, latestPath };
}
