import { BROKER_CONNECTOR_LIMITS } from "../limits";
import type {
  InvestApiBrokerReportResponse,
  InvestApiGetAccountsResponse,
  InvestApiGetBrokerReportResponse,
  InvestApiGetOperationsByCursorResponse,
  InvestApiOperation,
  InvestApiPortfolioResponse,
} from "../contracts/invest-api-v1";
import { InvestHttpClient } from "../http-client";
import { TBANK_INVEST_REST_PATHS } from "./endpoints";

export interface TbankInvestClientOptions {
  http: InvestHttpClient;
}

export interface TbankFetchAccountsResult {
  accounts: NonNullable<InvestApiGetAccountsResponse["accounts"]>;
}

export interface TbankFetchPortfolioResult {
  portfolio: InvestApiPortfolioResponse;
}

export interface TbankFetchOperationsResult {
  operations: InvestApiOperation[];
  truncated: boolean;
}

export interface TbankFetchBrokerReportResult {
  rows: NonNullable<InvestApiGetBrokerReportResponse["brokerReport"]>;
  truncated: boolean;
}

export class TbankInvestApiClient {
  private readonly http: InvestHttpClient;

  constructor(options: TbankInvestClientOptions) {
    this.http = options.http;
  }

  async fetchAccounts(): Promise<TbankFetchAccountsResult> {
    const response = await this.http.post<InvestApiGetAccountsResponse>({
      path: TBANK_INVEST_REST_PATHS.getAccounts,
      body: {},
    });
    return { accounts: response.accounts ?? [] };
  }

  async fetchPortfolio(accountId: string): Promise<TbankFetchPortfolioResult> {
    const portfolio = await this.http.post<InvestApiPortfolioResponse>({
      path: TBANK_INVEST_REST_PATHS.getPortfolio,
      body: { accountId, currency: "RUB" },
    });
    return { portfolio };
  }

  async fetchOperations(params: {
    accountId: string;
    from?: string;
    to?: string;
  }): Promise<TbankFetchOperationsResult> {
    const operations: InvestApiOperation[] = [];
    let cursor: string | undefined;
    let truncated = false;

    while (operations.length < BROKER_CONNECTOR_LIMITS.maxOperations) {
      const response = await this.http.post<InvestApiGetOperationsByCursorResponse>({
        path: TBANK_INVEST_REST_PATHS.getOperationsByCursor,
        body: {
          accountId: params.accountId,
          from: params.from,
          to: params.to,
          cursor,
          limit: BROKER_CONNECTOR_LIMITS.operationsPageSize,
          state: "OPERATION_STATE_EXECUTED",
        },
      });

      const items = response.items ?? [];
      for (const item of items) {
        operations.push({
          id: item.id,
          parentOperationId: item.parentOperationId,
          currency: item.payment?.currency,
          payment: item.payment,
          price: item.price,
          state: item.state,
          quantity: item.quantity,
          figi: item.figi,
          instrumentType: item.instrumentType,
          instrumentUid: item.instrumentUid,
          date: item.date,
          type: item.type,
          trades:
            item.tradesInfo?.trades?.map((trade) => ({
              tradeId: trade.num,
              dateTime: trade.date,
              quantity: trade.quantity,
              price: trade.price,
            })) ?? [],
        });
      }

      if (!response.hasNext || !response.nextCursor) {
        break;
      }

      if (operations.length >= BROKER_CONNECTOR_LIMITS.maxOperations) {
        truncated = true;
        break;
      }

      cursor = response.nextCursor;
    }

    return { operations, truncated };
  }

  async fetchBrokerReport(params: {
    accountId: string;
    from: string;
    to: string;
  }): Promise<TbankFetchBrokerReportResult> {
    const generate = await this.http.post<InvestApiBrokerReportResponse>({
      path: TBANK_INVEST_REST_PATHS.getBrokerReport,
      body: {
        generateBrokerReportRequest: {
          accountId: params.accountId,
          from: params.from,
          to: params.to,
        },
      },
    });

    const taskId = generate.generateBrokerReportResponse?.taskId;
    if (!taskId) {
      return { rows: [], truncated: false };
    }

    const rows: NonNullable<InvestApiGetBrokerReportResponse["brokerReport"]> = [];
    let page = 1;
    let pagesCount = 1;
    let truncated = false;

    while (rows.length < BROKER_CONNECTOR_LIMITS.maxBrokerReportRows) {
      const response = await this.http.post<InvestApiBrokerReportResponse>({
        path: TBANK_INVEST_REST_PATHS.getBrokerReport,
        body: {
          getBrokerReportRequest: {
            taskId,
            page,
          },
        },
      });

      const report = response.getBrokerReportResponse;
      const batch = report?.brokerReport ?? [];
      rows.push(...batch);

      pagesCount = (report?.pagesCount ?? 0) + 1;
      const currentPage = report?.page ?? page - 1;

      if (currentPage + 1 >= pagesCount || batch.length === 0) {
        break;
      }

      if (rows.length >= BROKER_CONNECTOR_LIMITS.maxBrokerReportRows) {
        truncated = true;
        break;
      }

      page += 1;
    }

    return { rows, truncated };
  }
}
