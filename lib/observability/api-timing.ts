import { recordNodeHttpRequest } from "@/lib/observability/runtime-metrics";

export function startApiTimer(): number {
  return Date.now();
}

export function finishApiTimer(startedAt: number, status: number): void {
  recordNodeHttpRequest(status, Date.now() - startedAt);
}
