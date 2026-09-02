import { ledgerToBrokerReport } from "../../broker-adapters/normalize";
import { reconcileBrokerLedger } from "../../broker-adapters/reconcile";
import { INVEST_API_CONTRACT_VERSION } from "../contracts/invest-api-v1";
import {
  BrokerConnectorErrorCode,
  brokerConnectorError,
} from "../errors";
import { InvestHttpClient } from "../http-client";
import type {
  BrokerConnector,
  BrokerConnectorSyncInput,
  BrokerConnectorSyncResult,
} from "../types";
import { TbankInvestApiClient } from "./client";
import { mapTbankApiToLedger } from "./map-ledger";
import { resolveTbankInvestBaseUrl } from "./endpoints";

function defaultPeriod(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

function pickAccount(
  accounts: Array<{ id?: string; status?: string }>,
  preferredId?: string,
): string | null {
  if (preferredId) {
    const match = accounts.find((account) => account.id === preferredId);
    if (match?.id) return match.id;
  }

  const open = accounts.find(
    (account) =>
      account.id &&
      (account.status === "ACCOUNT_STATUS_OPEN" || !account.status),
  );
  return open?.id ?? accounts.find((account) => account.id)?.id ?? null;
}

export const tbankInvestApiConnector: BrokerConnector = {
  id: "tbank-invest-api-v1",
  version: "0.1.0",
  label: "T-Bank Invest API (read-only)",
  status: "experimental",
  apiContractVersion: INVEST_API_CONTRACT_VERSION,

  async sync(input: BrokerConnectorSyncInput): Promise<BrokerConnectorSyncResult> {
    const syncedAt = new Date().toISOString();
    const environment = input.environment ?? "production";
    const mockTransport = Boolean(input.baseUrl);
    const period = defaultPeriod();
    const periodStart = input.periodStart ?? period.from.slice(0, 10);
    const periodEnd = input.periodEnd ?? period.to.slice(0, 10);

    const provenance = {
      connectorId: "tbank-invest-api-v1" as const,
      connectorVersion: "0.1.0",
      connectorLabel: "T-Bank Invest API (read-only)",
      environment,
      accountId: input.accountId ?? null,
      apiContractVersion: INVEST_API_CONTRACT_VERSION,
      syncedAt,
      mockTransport,
    };

    if (!input.credentials?.token?.trim()) {
      return {
        ok: false,
        ledger: null,
        report: null,
        provenance,
        coverage: null,
        warnings: [],
        reconciliation: null,
        errors: [
          brokerConnectorError(
            BrokerConnectorErrorCode.INVALID_TOKEN,
            "Broker API token must be supplied at runtime",
          ),
        ],
      };
    }

    const http = new InvestHttpClient({
      baseUrl: input.baseUrl ?? resolveTbankInvestBaseUrl(environment),
      token: input.credentials.token,
      fetchImpl: input.fetchImpl,
    });

    const client = new TbankInvestApiClient({ http });

    try {
      const { accounts } = await client.fetchAccounts();
      const accountId = pickAccount(accounts, input.accountId);
      if (!accountId) {
        return {
          ok: false,
          ledger: null,
          report: null,
          provenance: { ...provenance, accountId: null },
          coverage: null,
          warnings: [],
          reconciliation: null,
          errors: [
            brokerConnectorError(
              BrokerConnectorErrorCode.NO_ACCOUNT,
              "No brokerage account available for sync",
            ),
          ],
        };
      }

      const account =
        accounts.find((entry) => entry.id === accountId) ?? { id: accountId };

      const [{ portfolio }, { operations, truncated: operationsTruncated }, brokerReport] =
        await Promise.all([
          client.fetchPortfolio(accountId),
          client.fetchOperations({
            accountId,
            from: period.from,
            to: period.to,
          }),
          client.fetchBrokerReport({
            accountId,
            from: period.from,
            to: period.to,
          }),
        ]);

      const mapped = mapTbankApiToLedger({
        account,
        portfolio,
        operations,
        brokerReportRows: brokerReport.rows,
        periodStart,
        periodEnd,
        operationsTruncated,
        brokerReportTruncated: brokerReport.truncated,
      });

      const report = ledgerToBrokerReport(mapped.ledger);
      const reconciliation = reconcileBrokerLedger(mapped.ledger);
      const ok =
        mapped.ledger.securities.length > 0 || mapped.ledger.assetsEnd > 0;

      return {
        ok,
        ledger: mapped.ledger,
        report: ok ? report : null,
        provenance: { ...provenance, accountId },
        coverage: mapped.coverage,
        warnings: mapped.warnings,
        reconciliation,
        errors: ok
          ? []
          : [
              brokerConnectorError(
                BrokerConnectorErrorCode.RECOGNITION_FAILED,
                "Connector sync completed but returned no recognizable portfolio data",
              ),
            ],
      };
    } catch (error) {
      const connectorError =
        typeof error === "object" &&
        error != null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as import("../errors").BrokerConnectorError)
          : brokerConnectorError(
              BrokerConnectorErrorCode.API_ERROR,
              error instanceof Error ? error.message : String(error),
            );

      return {
        ok: false,
        ledger: null,
        report: null,
        provenance,
        coverage: null,
        warnings: [],
        reconciliation: null,
        errors: [connectorError],
      };
    }
  },
};
