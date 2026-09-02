/**
 * Subset of T-Invest API v1.43 REST contracts used by the read-only connector.
 * Source: https://github.com/RussianInvestments/investAPI (openapi.yaml)
 */
export const INVEST_API_CONTRACT_VERSION = "1.43";

export interface InvestApiMoneyValue {
  currency?: string;
  units?: string;
  nano?: number;
}

export interface InvestApiQuotation {
  units?: string;
  nano?: number;
}

export interface InvestApiAccount {
  id?: string;
  type?: string;
  name?: string;
  status?: string;
  openedDate?: string;
  closedDate?: string;
  accessLevel?: string;
}

export interface InvestApiGetAccountsResponse {
  accounts?: InvestApiAccount[];
}

export interface InvestApiPortfolioPosition {
  figi?: string;
  instrumentType?: string;
  instrumentUid?: string;
  ticker?: string;
  classCode?: string;
  quantity?: InvestApiQuotation;
  currentPrice?: InvestApiMoneyValue;
  averagePositionPrice?: InvestApiMoneyValue;
  expectedYield?: InvestApiQuotation;
  blocked?: boolean;
}

export interface InvestApiPortfolioResponse {
  accountId?: string;
  totalAmountPortfolio?: InvestApiMoneyValue;
  totalAmountShares?: InvestApiMoneyValue;
  totalAmountBonds?: InvestApiMoneyValue;
  totalAmountEtf?: InvestApiMoneyValue;
  totalAmountCurrencies?: InvestApiMoneyValue;
  positions?: InvestApiPortfolioPosition[];
}

export interface InvestApiOperationTrade {
  tradeId?: string;
  dateTime?: string;
  quantity?: string;
  price?: InvestApiMoneyValue;
}

export interface InvestApiOperation {
  id?: string;
  parentOperationId?: string;
  currency?: string;
  payment?: InvestApiMoneyValue;
  price?: InvestApiMoneyValue;
  state?: string;
  quantity?: string;
  quantityRest?: string;
  figi?: string;
  instrumentType?: string;
  instrumentUid?: string;
  date?: string;
  type?: string;
  trades?: InvestApiOperationTrade[];
}

export interface InvestApiOperationsResponse {
  operations?: InvestApiOperation[];
}

export interface InvestApiOperationCursorItem {
  cursor?: string;
  brokerAccountId?: string;
  id?: string;
  parentOperationId?: string;
  name?: string;
  description?: string;
  date?: string;
  type?: string;
  state?: string;
  figi?: string;
  instrumentType?: string;
  instrumentUid?: string;
  payment?: InvestApiMoneyValue;
  price?: InvestApiMoneyValue;
  quantity?: string;
  tradesInfo?: {
    trades?: Array<{
      num?: string;
      date?: string;
      quantity?: string;
      price?: InvestApiMoneyValue;
    }>;
  };
}

export interface InvestApiGetOperationsByCursorResponse {
  hasNext?: boolean;
  nextCursor?: string;
  items?: InvestApiOperationCursorItem[];
}

export interface InvestApiBrokerReportRow {
  tradeId?: string;
  orderId?: string;
  figi?: string;
  ticker?: string;
  classCode?: string;
  name?: string;
  direction?: string;
  quantity?: string;
  price?: InvestApiMoneyValue;
  orderAmount?: InvestApiMoneyValue;
  totalOrderAmount?: InvestApiMoneyValue;
  brokerCommission?: InvestApiMoneyValue;
  exchangeCommission?: InvestApiMoneyValue;
  exchangeClearingCommission?: InvestApiMoneyValue;
  tradeDatetime?: string;
  secValueDate?: string;
  clearValueDate?: string;
  brokerStatus?: string;
}

export interface InvestApiGetBrokerReportResponse {
  brokerReport?: InvestApiBrokerReportRow[];
  itemsCount?: number;
  pagesCount?: number;
  page?: number;
}

export interface InvestApiBrokerReportResponse {
  generateBrokerReportResponse?: { taskId?: string };
  getBrokerReportResponse?: InvestApiGetBrokerReportResponse;
}

export interface InvestApiErrorResponse {
  code?: number;
  message?: string;
  description?: number;
}
