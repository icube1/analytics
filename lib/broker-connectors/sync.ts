import { reconcileBrokerLedger } from "../broker-adapters/reconcile";
import { ledgerToBrokerReport } from "../broker-adapters/normalize";
import {
  BrokerConnectorErrorCode,
  brokerConnectorError,
} from "./errors";
import { getBrokerConnectorFeatureStatus, isBrokerConnectorEnabled } from "./feature-flags";
import { getBrokerConnector } from "./registry";
import type { BrokerConnectorSyncInput, BrokerConnectorSyncResult } from "./types";

export function syncBrokerConnector(
  input: BrokerConnectorSyncInput,
): Promise<BrokerConnectorSyncResult> {
  const featureStatus = getBrokerConnectorFeatureStatus(input.connectorId);

  if (!isBrokerConnectorEnabled(input.connectorId)) {
    return Promise.resolve({
      ok: false,
      ledger: null,
      report: null,
      provenance: {
        connectorId: input.connectorId,
        connectorVersion: "0",
        connectorLabel: "disabled",
        environment: input.environment ?? "production",
        accountId: input.accountId ?? null,
        apiContractVersion: "0",
        syncedAt: new Date().toISOString(),
        mockTransport: Boolean(input.baseUrl),
      },
      coverage: null,
      warnings: [],
      reconciliation: null,
      errors: [
        brokerConnectorError(
          BrokerConnectorErrorCode.FEATURE_DISABLED,
          `Broker connector ${input.connectorId} is ${featureStatus}; set BROKER_CONNECTOR_TBANK_ENABLED=true or NEXT_PUBLIC_BROKER_CONNECTOR_TBANK=1 to enable`,
        ),
      ],
    });
  }

  const connector = getBrokerConnector(input.connectorId);
  if (!connector) {
    return Promise.resolve({
      ok: false,
      ledger: null,
      report: null,
      provenance: {
        connectorId: input.connectorId,
        connectorVersion: "0",
        connectorLabel: "unknown",
        environment: input.environment ?? "production",
        accountId: input.accountId ?? null,
        apiContractVersion: "0",
        syncedAt: new Date().toISOString(),
        mockTransport: Boolean(input.baseUrl),
      },
      coverage: null,
      warnings: [],
      reconciliation: null,
      errors: [
        brokerConnectorError(
          BrokerConnectorErrorCode.API_ERROR,
          `Unknown broker connector: ${input.connectorId}`,
        ),
      ],
    });
  }

  return connector.sync(input).then((result) => {
    if (result.ledger && !result.reconciliation) {
      return {
        ...result,
        reconciliation: reconcileBrokerLedger(result.ledger),
        report: result.report ?? ledgerToBrokerReport(result.ledger),
      };
    }
    return result;
  });
}
