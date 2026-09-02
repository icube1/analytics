import type { ProductEvent } from "./schema";

export interface TelemetrySinkConfig {
  enabled: boolean;
  endpoint?: string;
}

/** Telemetry sink is disabled by default — no outbound product events unless opted in. */
export const DEFAULT_TELEMETRY_SINK: TelemetrySinkConfig = {
  enabled: false,
};

export type TelemetrySink = (event: ProductEvent) => void | Promise<void>;

let activeSink: TelemetrySinkConfig = { ...DEFAULT_TELEMETRY_SINK };
let customHandler: TelemetrySink | null = null;

export function getTelemetrySinkConfig(): TelemetrySinkConfig {
  return { ...activeSink };
}

export function configureTelemetrySink(
  config: Partial<TelemetrySinkConfig>,
  handler?: TelemetrySink,
): void {
  activeSink = { ...DEFAULT_TELEMETRY_SINK, ...config };
  customHandler = handler ?? null;
}

export function resetTelemetrySink(): void {
  activeSink = { ...DEFAULT_TELEMETRY_SINK };
  customHandler = null;
}

/**
 * Emit a product event. When the sink is disabled (default), events are
 * dropped silently — callers may still persist them locally.
 */
export async function emitProductEvent(event: ProductEvent): Promise<void> {
  if (!activeSink.enabled) return;
  if (customHandler) {
    await customHandler(event);
    return;
  }
  if (activeSink.endpoint && typeof fetch !== "undefined") {
    try {
      await fetch(activeSink.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        keepalive: true,
      });
    } catch {
      // Sink failures must not break the UI.
    }
  }
}
