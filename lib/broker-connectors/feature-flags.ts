import type { BrokerConnectorId } from "./types";

/**
 * UI-neutral feature gate for experimental broker API connectors.
 * Disabled by default; enable explicitly in server/runtime configuration.
 */
export const BROKER_CONNECTOR_FEATURE_FLAGS: Record<
  BrokerConnectorId,
  { enabled: boolean; status: "experimental" }
> = {
  "tbank-invest-api-v1": {
    enabled: process.env.BROKER_CONNECTOR_TBANK_ENABLED === "true",
    status: "experimental",
  },
};

export function isBrokerConnectorEnabled(id: BrokerConnectorId): boolean {
  return BROKER_CONNECTOR_FEATURE_FLAGS[id]?.enabled === true;
}

export function getBrokerConnectorFeatureStatus(
  id: BrokerConnectorId,
): "experimental" | "disabled" {
  const flag = BROKER_CONNECTOR_FEATURE_FLAGS[id];
  if (!flag?.enabled) return "disabled";
  return flag.status;
}
