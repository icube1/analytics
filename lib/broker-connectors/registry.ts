import { tbankInvestApiConnector } from "./tbank/connector";
import type { BrokerConnector, BrokerConnectorId } from "./types";

export const BROKER_CONNECTORS: BrokerConnector[] = [tbankInvestApiConnector];

export function getBrokerConnector(id: BrokerConnectorId): BrokerConnector | null {
  return BROKER_CONNECTORS.find((connector) => connector.id === id) ?? null;
}

export function listBrokerConnectors(): BrokerConnector[] {
  return [...BROKER_CONNECTORS];
}
