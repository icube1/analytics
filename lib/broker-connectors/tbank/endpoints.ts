import type { BrokerConnectorEnvironment } from "../types";

export const TBANK_INVEST_API_CONTRACT = "1.43";

export const TBANK_INVEST_REST_PATHS = {
  getAccounts:
    "/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts",
  getPortfolio:
    "/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio",
  getOperations:
    "/tinkoff.public.invest.api.contract.v1.OperationsService/GetOperations",
  getOperationsByCursor:
    "/tinkoff.public.invest.api.contract.v1.OperationsService/GetOperationsByCursor",
  getBrokerReport:
    "/tinkoff.public.invest.api.contract.v1.OperationsService/GetBrokerReport",
} as const;

export function resolveTbankInvestBaseUrl(
  environment: BrokerConnectorEnvironment,
): string {
  return environment === "sandbox"
    ? "https://sandbox-invest-public-api.tbank.ru/rest"
    : "https://invest-public-api.tbank.ru/rest";
}
