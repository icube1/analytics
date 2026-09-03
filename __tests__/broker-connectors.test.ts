import {
  BROKER_CONNECTOR_FEATURE_FLAGS,
  moneyValueToNumber,
  quotationToNumber,
  readTbankConnectorEnvEnabled,
  redactSecrets,
  syncBrokerConnector,
  TBANK_INVEST_REST_PATHS,
} from "@/lib/broker-connectors";
import { createTbankFixtureFetch } from "./helpers/tbank-fixture-fetch";

describe("broker API connectors", () => {
  const previousFlag = BROKER_CONNECTOR_FEATURE_FLAGS["tbank-invest-api-v1"].enabled;

  beforeAll(() => {
    BROKER_CONNECTOR_FEATURE_FLAGS["tbank-invest-api-v1"].enabled = true;
  });

  afterAll(() => {
    BROKER_CONNECTOR_FEATURE_FLAGS["tbank-invest-api-v1"].enabled = previousFlag;
  });

  it("rejects sync when feature flag is disabled", async () => {
    BROKER_CONNECTOR_FEATURE_FLAGS["tbank-invest-api-v1"].enabled = false;
    const result = await syncBrokerConnector({
      connectorId: "tbank-invest-api-v1",
      credentials: { token: "t.synthetic-token" },
      baseUrl: "https://mock.tbank/rest",
      fetchImpl: createTbankFixtureFetch(),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("FEATURE_DISABLED");
    BROKER_CONNECTOR_FEATURE_FLAGS["tbank-invest-api-v1"].enabled = true;
  });

  it("converts MoneyValue and Quotation units+nano", () => {
    expect(
      moneyValueToNumber({ units: "152500", nano: 500000000, currency: "rub" }),
    ).toBeCloseTo(152500.5, 6);
    expect(quotationToNumber({ units: "100", nano: 250000000 })).toBeCloseTo(
      100.25,
      6,
    );
    expect(moneyValueToNumber({ units: "-10", nano: -500000000 })).toBeCloseTo(
      -10.5,
      6,
    );
  });

  it("redacts bearer tokens from error messages", () => {
    const token = "t.SuperSecretTokenValue";
    const redacted = redactSecrets(`Bearer ${token} failed`, token);
    expect(redacted).not.toContain(token);
    expect(redacted).toContain("[REDACTED]");
  });

  it("syncs ledger from mocked T-Invest API fixtures", async () => {
    const result = await syncBrokerConnector({
      connectorId: "tbank-invest-api-v1",
      credentials: { token: "t.synthetic-runtime-token" },
      accountId: "SANITIZED-ACCOUNT-001",
      periodStart: "2025-01-01",
      periodEnd: "2025-01-31",
      baseUrl: "https://mock.tbank/rest",
      fetchImpl: createTbankFixtureFetch(),
    });

    expect(result.ok).toBe(true);
    expect(result.provenance.connectorId).toBe("tbank-invest-api-v1");
    expect(result.provenance.mockTransport).toBe(true);
    expect(result.provenance.accountId).toBe("SANITIZED-ACCOUNT-001");
    expect(result.coverage?.securities).toBe(true);
    expect(result.coverage?.cash).toBe(true);
    expect(result.coverage?.trades).toBe(true);
    expect(result.report?.securities).toHaveLength(1);
    expect(result.report?.securities[0]?.name).toBe("SBER");
    expect(result.report?.cash[0]?.end).toBeCloseTo(2500.5, 2);
    expect(result.report?.trades[0]?.brokerFee).toBe(39);
    expect(result.reconciliation).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain("t.synthetic-runtime-token");
  });

  it("does not enable the T-Bank connector from public flags by default", () => {
    const previousPublic = process.env.NEXT_PUBLIC_BROKER_CONNECTOR_TBANK;
    const previousVite = process.env.VITE_BROKER_CONNECTOR_TBANK;
    const previousServer = process.env.BROKER_CONNECTOR_TBANK_ENABLED;
    delete process.env.NEXT_PUBLIC_BROKER_CONNECTOR_TBANK;
    delete process.env.VITE_BROKER_CONNECTOR_TBANK;
    delete process.env.BROKER_CONNECTOR_TBANK_ENABLED;
    expect(readTbankConnectorEnvEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_BROKER_CONNECTOR_TBANK = "1";
    expect(readTbankConnectorEnvEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_BROKER_CONNECTOR_TBANK = previousPublic;
    process.env.VITE_BROKER_CONNECTOR_TBANK = previousVite;
    process.env.BROKER_CONNECTOR_TBANK_ENABLED = previousServer;
  });

  it("exposes REST paths aligned with official contract", () => {
    expect(TBANK_INVEST_REST_PATHS.getAccounts).toContain("UsersService/GetAccounts");
    expect(TBANK_INVEST_REST_PATHS.getPortfolio).toContain(
      "OperationsService/GetPortfolio",
    );
    expect(TBANK_INVEST_REST_PATHS.getOperationsByCursor).toContain(
      "OperationsService/GetOperationsByCursor",
    );
    expect(TBANK_INVEST_REST_PATHS.getBrokerReport).toContain(
      "OperationsService/GetBrokerReport",
    );
  });
});
