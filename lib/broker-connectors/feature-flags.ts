import type { BrokerConnectorId } from "./types";

/**
 * Experimental broker API connectors stay off unless an explicit flag is set.
 * Server/tests: `BROKER_CONNECTOR_TBANK_ENABLED=true`
 * Browser: `NEXT_PUBLIC_BROKER_CONNECTOR_TBANK=1` or `VITE_BROKER_CONNECTOR_TBANK=1`
 */
declare const __VITE_BROKER_CONNECTOR_TBANK__: string | undefined;

const TBANK_ENV_KEYS = [
  "BROKER_CONNECTOR_TBANK_ENABLED",
  "NEXT_PUBLIC_BROKER_CONNECTOR_TBANK",
  "VITE_BROKER_CONNECTOR_TBANK",
] as const;

function parseEnabledFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function readTbankConnectorEnvEnabled(): boolean {
  if (typeof process !== "undefined") {
    for (const key of TBANK_ENV_KEYS) {
      if (parseEnabledFlag(process.env[key])) return true;
    }
  }
  if (
    typeof __VITE_BROKER_CONNECTOR_TBANK__ === "string" &&
    parseEnabledFlag(__VITE_BROKER_CONNECTOR_TBANK__)
  ) {
    return true;
  }
  return false;
}

export const BROKER_CONNECTOR_FEATURE_FLAGS: Record<
  BrokerConnectorId,
  { enabled: boolean; status: "experimental" }
> = {
  "tbank-invest-api-v1": {
    enabled: readTbankConnectorEnvEnabled(),
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
