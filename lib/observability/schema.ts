export const OBSERVABILITY_SCHEMA_VERSION = 1;

export type StatusBreakdown = { "2xx": number; "3xx": number; "4xx": number; "5xx": number };
export type LatencyPercentiles = { p50: number; p95: number; p99: number };

export type ServiceSnapshot = {
  uptimeSecs: number;
  memoryRssMb?: number;
  heapUsedMb?: number;
  http: { requests: number; latencyMs: LatencyPercentiles; status: StatusBreakdown };
  jobs?: { pending: number; running: number; failed: number; completed: number; byKind?: Record<string, number> };
  cache?: { marketBenchmark?: { fresh: boolean; sizeKb: number } };
  imports?: { brokerSuccess: number; brokerFailed: number };
  database?: { ok: boolean; poolSize?: number; poolIdle?: number };
};

export type ObservabilitySnapshot = {
  schemaVersion: typeof OBSERVABILITY_SCHEMA_VERSION;
  collectedAt: string;
  host: { cpuPercent: number; memoryRssMb: number; load1?: number; disk: { usedPercent: number; freeMb: number } };
  nginx?: { windowSecs: number; requests: number; latencyMs: LatencyPercentiles; status: StatusBreakdown };
  services: { financeApi?: ServiceSnapshot; nodeApp?: ServiceSnapshot };
};

export type HostSnapshot = ObservabilitySnapshot["host"];
export type NginxSnapshot = NonNullable<ObservabilitySnapshot["nginx"]>;

export function emptyStatusBreakdown(): StatusBreakdown {
  return { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
}
export function emptyLatencyPercentiles(): LatencyPercentiles {
  return { p50: 0, p95: 0, p99: 0 };
}
