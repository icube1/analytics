export interface SecurityPosition {
  id: string;
  name: string;
  isin: string;
  currency: string;
  quantityStart: number;
  quantityEnd: number;
  priceStart: number;
  priceEnd: number;
  valueStart: number;
  valueEnd: number;
  valueChange: number;
}

export interface CashPosition {
  platform: string;
  currency: string;
  rateEnd: number;
  start: number;
  change: number;
  end: number;
}

export interface BrokerTrade {
  id: string;
  date: string;
  settlementDate: string;
  name: string;
  ticker: string;
  side: string;
  quantity: number;
  price: number;
  amount: number;
  brokerFee: number;
  exchangeFee: number;
}

export interface CashFlow {
  id: string;
  date: string;
  description: string;
  currency: string;
  credit: number;
  debit: number;
}

export interface BrokerReport {
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  investor: string;
  contract: string;
  assetsStart: number;
  assetsEnd: number;
  assetsChange: number;
  securitiesStart: number;
  securitiesEnd: number;
  cashStart: number;
  cashEnd: number;
  securities: SecurityPosition[];
  cash: CashPosition[];
  trades: BrokerTrade[];
  cashFlows: CashFlow[];
}

export interface DebtObligation {
  id: string;
  enabled: boolean;
  label: string;
  balance: number;
  monthlyPayment: number;
  annualInterestRate: number;
  /** День месяца для платежа (как в графике банка), по умолчанию 6 */
  paymentDay?: number;
}

export type AssetReturnMode = "none" | "percent" | "income";
export type AssetIncomePeriod = "monthly" | "yearly";
export type AssetKind = "standard" | "deposit";
/** at_maturity — проценты в конце срока; monthly_capitalized — ежемесячная капитализация */
export type DepositInterestMode = "at_maturity" | "monthly_capitalized";

export interface CustomAssetItem {
  id: string;
  enabled: boolean;
  label: string;
  /** standard — обычный актив; deposit — срочный вклад */
  assetKind?: AssetKind;
  /** Оценочная / рыночная стоимость, ₽ */
  value: number;
  /** Привязанный долг (ипотека и т.п.), ₽ */
  debt: number;
  monthlyDebtPayment: number;
  /** Годовая ставка по привязанному долгу, % */
  debtAnnualRate: number;
  /** День месяца платежа по долгу (Альфа и т.п.), по умолчанию 6 */
  debtPaymentDay?: number;
  /** Рост стоимости вместе с инфляцией */
  growsWithInflation: boolean;
  returnMode: AssetReturnMode;
  /** Доходность в % годовых, если returnMode === "percent" */
  annualReturnPercent: number;
  /** Денежный доход (аренда и т.п.), если returnMode === "income" */
  incomeAmount: number;
  incomePeriod: AssetIncomePeriod;
  /** Учитывать в доле облагаемых дивидендами активов (ПИФы) */
  generatesDividendTax: boolean;
  /** Срок вклада, мес. (только assetKind === "deposit") */
  depositTermMonths?: number;
  /** Дата открытия вклада YYYY-MM-DD */
  depositOpenedAt?: string;
  depositInterestMode?: DepositInterestMode;
  notes: string;
}

export interface CustomAssets {
  items: CustomAssetItem[];
  otherDebts: DebtObligation[];
}

/** @deprecated Только для миграции старых данных */
export interface ApartmentAsset {
  enabled: boolean;
  label: string;
  estimatedValue: number;
  mortgageDebt: number;
  monthlyMortgagePayment: number;
  mortgageAnnualRate: number;
  notes: string;
}

/** @deprecated Только для миграции старых данных */
export interface ReitAsset {
  enabled: boolean;
  label: string;
  fundName: string;
  units: number;
  pricePerUnit: number;
  notes: string;
}

/** @deprecated Только для миграции старых данных */
export interface GoldAsset {
  enabled: boolean;
  label: string;
  weightGrams: number;
  pricePerGram: number;
  notes: string;
}

export interface CompoundParams {
  initialCapital: number;
  monthlyContribution: number;
  annualReturnPercent: number;
  inflationPercent: number;
  years: number;
  taxOnProfitPercent: number;
  contributionGrowthPercent: number;
  compoundFrequency: "monthly" | "quarterly" | "semiannual" | "yearly";
  /**
   * effective — (1 + годовая)^(1/12) − 1, математически точная капитализация;
   * simple — годовая ÷ 12, как во многих банковских калькуляторах
   */
  monthlyRateMethod: "effective" | "simple";
  adjustContributionsForInflation: boolean;
  /** Реинвестировать доход в портфель (иначе выводится ежемесячно) */
  reinvestReturns: boolean;
  /** С какого года начать фиксированный ежемесячный вывод (null — не выводить) */
  withdrawAfterYears: number | null;
  /** fixed — сумма в сегодняшних ₽; percent — доля портфеля в месяц */
  withdrawalMode: "fixed" | "percent";
  /** Ежемесячный вывод после горизонта в рублях сегодня (покупательная способность) */
  monthlyWithdrawal: number;
  /** Годовой вывод, % от доступного баланса (если withdrawalMode === percent; в месяц = годовой ÷ 12) */
  annualWithdrawalPercent: number;
  /** Учитывать налог на дивиденды по акциям и ПИФам (выкл. для ИИС и черновых расчётов) */
  taxDividends: boolean;
  /** Доля портфеля в акциях и ПИФах (облагаются дивидендами), 0–1 */
  taxableAssetShare: number;
  /** Ожидаемая дивидендная доходность на акции/ПИФы, % годовых */
  dividendYieldPercent: number;
  /** После погашения долгов инвестировать освободившиеся платежи */
  reinvestFreedDebtPayments: boolean;
  /**
   * true — пополнение / мес идёт целиком в брокера, платежи по долгам сверху;
   * false — из пополнения сначала вычитаются долги, остаток в брокера
   */
  debtPaymentsSeparateFromContribution: boolean;
}

export interface PortfolioStorage {
  customAssets: CustomAssets;
  compoundParams: CompoundParams;
  lastBrokerFileName: string;
}

export interface PortfolioDocument extends PortfolioStorage {
  version: 1;
  updatedAt: string;
  brokerReport: BrokerReport | null;
  /** История загрузок отчётов брокера для трекинга */
  brokerSnapshots: BrokerBalanceSnapshot[];
  /** История остатка долга для расчёта погашенного тела */
  debtBalanceHistory: DebtBalanceEntry[];
  /** Сохранённые сценарии прогноза */
  forecastPlans: SavedForecastPlan[];
}

/** Запись остатка долга (при изменении активов или загрузке отчёта) */
export interface DebtBalanceEntry {
  id: string;
  recordedAt: string;
  totalDebt: number;
  source: "assets" | "broker-upload" | "backfill";
}

/** Пополнение брокерского счёта из отчёта */
export interface BrokerDepositFlow {
  id: string;
  date: string;
  amount: number;
  description: string;
}

/** Снимок баланса при загрузке HTML-отчёта */
export interface BrokerBalanceSnapshot {
  id: string;
  uploadedAt: string;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  brokerTotal: number;
  customAssetsTotal: number;
  totalDebt: number;
  grandTotal: number;
  deposits: BrokerDepositFlow[];
}

export interface ForecastPlanPoint {
  month: number;
  /** Календарный месяц (YYYY-MM), к которому относится конец этого периода */
  calendarMonth?: string;
  label: string;
  balance: number;
  realBalance: number;
  monthlyTotalContribution: number;
  monthlyBrokerInvest: number;
  monthlyDebtPayment: number;
  monthlyDebtPrincipal?: number;
  monthlyDebtInterest?: number;
  monthlyWealthBuilding?: number;
  monthlyCashOutflow?: number;
  totalDebt: number;
}

export interface SavedForecastPlan {
  id: string;
  name: string;
  savedAt: string;
  params: CompoundParams;
  brokerTotal: number;
  customAssets: CustomAssets;
  points: ForecastPlanPoint[];
  summary: {
    finalBalance: number;
    finalRealBalance: number;
    totalContributed: number;
    effectiveAnnualReturn: number;
    finalTotalDebt: number;
  };
}

export const DEFAULT_CUSTOM_ASSETS: CustomAssets = {
  items: [],
  otherDebts: [],
};

export const DEFAULT_COMPOUND_PARAMS: CompoundParams = {
  initialCapital: 100_000,
  monthlyContribution: 60_000,
  annualReturnPercent: 12,
  inflationPercent: 6,
  years: 10,
  taxOnProfitPercent: 13,
  contributionGrowthPercent: 5,
  compoundFrequency: "monthly",
  monthlyRateMethod: "effective",
  adjustContributionsForInflation: false,
  reinvestReturns: true,
  withdrawAfterYears: null,
  withdrawalMode: "fixed",
  monthlyWithdrawal: 0,
  annualWithdrawalPercent: 4,
  taxDividends: false,
  taxableAssetShare: 0.5,
  dividendYieldPercent: 9.5,
  reinvestFreedDebtPayments: false,
  debtPaymentsSeparateFromContribution: false,
};

export const DEFAULT_STORAGE: PortfolioStorage = {
  customAssets: DEFAULT_CUSTOM_ASSETS,
  compoundParams: DEFAULT_COMPOUND_PARAMS,
  lastBrokerFileName: "portfolio.html",
};

export const DEFAULT_DOCUMENT: PortfolioDocument = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  ...DEFAULT_STORAGE,
  brokerReport: null,
  brokerSnapshots: [],
  debtBalanceHistory: [],
  forecastPlans: [],
};
