export interface Transaction {
  id: string;
  fingerprint: string;
  sourceFile: string;
  operationDate: Date;
  transactionDate: Date | null;
  accountName: string;
  accountNumber: string;
  cardName: string;
  cardNumber: string;
  merchant: string;
  amount: number;
  currency: string;
  status: string;
  category: string;
  mcc: string;
  type: "Списание" | "Пополнение" | string;
  comment: string;
  bonusValue: string;
  bonusTitle: string;
}

export interface Filters {
  dateFrom: string;
  dateTo: string;
  categories: string[];
  statuses: string[];
  types: string[];
  cards: string[];
  search: string;
  amountMin: string;
  amountMax: string;
  excludeInternalTransfers: boolean;
}

export const EMPTY_FILTERS: Filters = {
  dateFrom: "",
  dateTo: "",
  categories: [],
  statuses: [],
  types: [],
  cards: [],
  search: "",
  amountMin: "",
  amountMax: "",
  excludeInternalTransfers: false,
};

export interface SummaryStats {
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
  transactionCount: number;
  avgExpense: number;
  totalBonus: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  count: number;
}

export interface DailyFlow {
  date: string;
  income: number;
  expense: number;
}

export interface MerchantBreakdown {
  merchant: string;
  amount: number;
  count: number;
}
