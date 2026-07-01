import type { CustomAssets } from "../portfolio-types";

export interface CompoundContext {
  customAssets: CustomAssets;
  brokerTotal: number;
}

export interface AssetBreakdownEntry {
  id: string;
  label: string;
  /** Чистая стоимость актива (номинал): gross − debt для кастомных; баланс брокера для ликвидной части */
  netEquity: number;
}

export interface CompoundPoint {
  month: number;
  year: number;
  label: string;
  balance: number;
  /** Покупательная способность портфеля в рублях сегодня */
  realBalance: number;
  contributed: number;
  /** Все взносы, приведённые к рублям сегодня */
  realContributed: number;
  /** Номинальная стоимость, если капитал рос только на уровне инфляции */
  inflationHurdle: number;
  withdrawn: number;
  /** Выплата в этом месяце, номинальные ₽ (0 вне фазы вывода) */
  monthlyPayoutNominal: number;
  /** Выплата в этом месяце в сегодняшних ₽ */
  monthlyPayoutReal: number;
  /** Целевая выплата в сегодняшних ₽ (фикс. — сумма из поля; % — доля ном. баланса / m) */
  monthlyPayoutTargetReal: number;
  /** Выплата урезана из‑за нехватки ликвидной части */
  monthlyPayoutCapped: boolean;
  /** Ликвидная часть (брокер + реинвестируемые доходы), доступная для вывода */
  liquidityBalance: number;
  /** Месяц в фазе вывода */
  inWithdrawalPhase: boolean;
  /** Разбивка капитала по активам (номинал, чистая стоимость) */
  assetBreakdown: AssetBreakdownEntry[];
  totalDebt: number;
  /** Пополнение в брокера в этом месяце, ₽ */
  monthlyBrokerInvest: number;
  /** Платёж по долгам в этом месяце, ₽ */
  monthlyDebtPayment: number;
  /** Общий бюджет пополнения в этом месяце, ₽ */
  monthlyTotalContribution: number;
  profit: number;
  profitAfterTax: number;
}

export interface CompoundResult {
  points: CompoundPoint[];
  finalBalance: number;
  finalRealBalance: number;
  totalContributed: number;
  finalRealContributed: number;
  totalWithdrawn: number;
  totalTaxPaid: number;
  totalDividendTax: number;
  totalWithdrawalTax: number;
  totalProfit: number;
  totalProfitAfterTax: number;
  /** Доходность портфеля с учётом дат взносов (IRR), % годовых */
  effectiveAnnualReturn: number;
  realAnnualReturn: number;
  monthlyReturnPercent: number;
  monthlyReturnPercentReal: number;
  monthlyIncomeAtEnd: number;
  monthlyIncomeRealAtEnd: number;
  finalTotalDebt: number;
  totalDebtPrincipalPaid: number;
  /** Последняя ежемесячная выплата в фазе вывода, номинал */
  withdrawalPayoutNominal: number;
  /** Последняя ежемесячная выплата в фазе вывода, сегодняшние ₽ */
  withdrawalPayoutReal: number;
  /** Последний месяц с ненулевой выплатой (null — выплаты шли до конца горизонта) */
  withdrawalLastPayoutMonth: number | null;
  withdrawalLastPayoutLabel: string | null;
  /** Выплаты прекратились до конца горизонта из‑за нехватки ликвидной части */
  withdrawalEndedEarly: boolean;
  /** Месяцев в фазе вывода без выплат после исчерпания */
  withdrawalMonthsWithoutPayout: number;
  /** Месяцев с нулевой (или почти нулевой) ликвидной частью в фазе вывода */
  withdrawalMonthsLiquidityEmpty: number;
  /** Первый месяц, когда ликвидная часть обнулилась */
  withdrawalLiquidityDepletedFromLabel: string | null;
  /** Ликвидная часть в первый месяц вывода (до списания) */
  withdrawalStartLiquidity: number | null;
  /** Первая выплата на руки, номинал и сегодняшние ₽ */
  withdrawalStartPayoutNominal: number;
  withdrawalStartPayoutReal: number;
  withdrawalStartLabel: string | null;
}

export interface WithdrawalMonthResult {
  monthPayoutNominal: number;
  monthPayoutReal: number;
  monthPayoutTargetReal: number;
  monthPayoutCapped: boolean;
  withdrawalMonthsWithoutPayoutDelta: number;
  withdrawalMonthsLiquidityEmptyDelta: number;
  withdrawalLiquidityDepletedFromLabel: string | null;
  lastWithdrawalPayoutNominal: number | null;
  lastWithdrawalPayoutReal: number | null;
  withdrawalLastPayoutMonth: number | null;
  withdrawalLastPayoutLabel: string | null;
  withdrawalStartLiquidity: number | null;
  withdrawalStartPayoutNominal: number | null;
  withdrawalStartPayoutReal: number | null;
  withdrawalStartLabel: string | null;
}
