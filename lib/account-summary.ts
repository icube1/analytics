/**
 * Сводка по одному счёту и по всем сразу: стоимость, вложено, P&L, XIRR.
 *
 * Важно про XIRR: он считается по датам денежных потоков. Если история короткая
 * (меньше ~60 дней) или пополнение было одно, годовая цифра получается громкой —
 * поэтому наружу отдаём флаг `xirrReliable`.
 */
import type {
  BrokerAccountKind,
  BrokerAccountSource,
  BrokerReport,
} from "./portfolio-types";
import { buildPortfolioFlows, toDayNumber, xirr, type CashFlowPoint } from "./xirr";

export interface FlowRecord {
  date: string;
  amount: number;
  direction: "deposit" | "withdrawal";
  source: "deposits-table" | "cash-flows";
}

export interface AccountSummary {
  id: string;
  label: string;
  kind: BrokerAccountKind;
  contract: string;
  periodStart: string;
  periodEnd: string;
  /** Рыночная стоимость бумаг + НКД, ₽ */
  securitiesValue: number;
  cashValue: number;
  marketValue: number;
  /** Сумма пополнений, ₽ */
  invested: number;
  /** Сумма выводов, ₽ */
  withdrawn: number;
  /** Реализованный результат из налогового блока, ₽ */
  realized: number;
  /** Нереализованный: marketValue − (invested − withdrawn) − realized */
  unrealized: number;
  /** Итоговый P&L: marketValue + withdrawn − invested */
  pnl: number;
  /** Годовая доходность, 0.12 = 12%; null — данных недостаточно */
  xirr: number | null;
  /** XIRR надёжен только на истории от 60 дней и при ≥1 потоке */
  xirrReliable: boolean;
  /** Известны ли пополнения: без них P&L и XIRR посчитать нельзя */
  investedKnown: boolean;
  flows: FlowRecord[];
  depositsFromReport: boolean;
}

const DEPOSIT_RE = /зачислен|пополнен|ввод\s*средств/i;
const WITHDRAW_RE = /вывод|списани[ея]\s*(д\/с|средств)|перевод\s*средств/i;
const NON_DEPOSIT_RE = /дивиденд|купон|сделк|комисс|налог|возврат/i;

function daysBetween(from: string, to: string): number {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  if (a === null || b === null) return 0;
  return Math.abs(b - a);
}

/** Пополнения: официальная таблица ИИС в приоритете, иначе — строки ДДС. */
export function extractFlows(report: BrokerReport): {
  deposits: FlowRecord[];
  withdrawals: FlowRecord[];
  fromReport: boolean;
} {
  const tableDeposits: FlowRecord[] = (report.deposits ?? [])
    .filter((deposit) => deposit.amount > 0 && deposit.date)
    .map((deposit) => ({
      date: deposit.date,
      amount: deposit.amount,
      direction: "deposit" as const,
      source: "deposits-table" as const,
    }));

  const flowDeposits: FlowRecord[] = (report.cashFlows ?? [])
    .filter(
      (flow) =>
        flow.credit > 0 &&
        DEPOSIT_RE.test(flow.description) &&
        !NON_DEPOSIT_RE.test(flow.description),
    )
    .map((flow) => ({
      date: flow.date,
      amount: flow.credit,
      direction: "deposit" as const,
      source: "cash-flows" as const,
    }));

  const withdrawals: FlowRecord[] = (report.cashFlows ?? [])
    .filter((flow) => flow.debit > 0 && WITHDRAW_RE.test(flow.description))
    .map((flow) => ({
      date: flow.date,
      amount: flow.debit,
      direction: "withdrawal" as const,
      source: "cash-flows" as const,
    }));

  const deposits = tableDeposits.length ? tableDeposits : flowDeposits;
  return { deposits, withdrawals, fromReport: tableDeposits.length > 0 };
}

function sumSecurities(report: BrokerReport): number {
  return (report.securities ?? []).reduce(
    (sum, position) => sum + (position.valueEnd || 0) + (position.nkdEnd || 0),
    0,
  );
}

function sumCash(report: BrokerReport): number {
  // Валютные остатки не конвертируем: в отчётах Сбера по RUB-счетам они нулевые.
  return (report.cash ?? [])
    .filter((item) => item.currency === "RUB")
    .reduce((sum, item) => sum + (item.end || 0), 0);
}

export function summarizeAccount(
  account: BrokerAccountSource,
  options: { asOf?: string } = {},
): AccountSummary {
  const report = account.report;
  const securitiesValue = sumSecurities(report);
  const cashValue = sumCash(report);
  const marketValue = securitiesValue + cashValue;

  const { deposits, withdrawals, fromReport } = extractFlows(report);
  const invested = deposits.reduce((sum, flow) => sum + flow.amount, 0);
  const withdrawn = withdrawals.reduce((sum, flow) => sum + flow.amount, 0);

  const realized = report.tax?.realized ?? 0;
  const pnl = marketValue + withdrawn - invested;
  const unrealized = pnl - realized;

  const terminalDate =
    options.asOf ?? report.periodEnd ?? new Date().toISOString().slice(0, 10);
  const flows: CashFlowPoint[] = buildPortfolioFlows({
    deposits: deposits.map((flow) => ({ date: flow.date, amount: flow.amount })),
    withdrawals: withdrawals.map((flow) => ({
      date: flow.date,
      amount: flow.amount,
    })),
    terminalValue: marketValue,
    terminalDate,
  });

  const firstFlowDate = [...deposits, ...withdrawals]
    .map((flow) => flow.date)
    .sort()[0];
  const historyDays = firstFlowDate ? daysBetween(firstFlowDate, terminalDate) : 0;
  const investedKnown = deposits.length > 0;
  // Без известных пополнений XIRR не считаем: получилась бы фикция
  const rate = investedKnown ? xirr(flows) : null;

  return {
    id: account.id,
    label: account.label ?? report.contract ?? account.fileName,
    kind: account.kind ?? report.accountKind ?? "broker",
    contract: account.contract ?? report.contract ?? "",
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    securitiesValue,
    cashValue,
    marketValue,
    invested,
    withdrawn,
    realized,
    unrealized,
    pnl,
    xirr: rate,
    xirrReliable: rate !== null && historyDays >= 60,
    investedKnown,
    flows: [...deposits, ...withdrawals].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    depositsFromReport: fromReport,
  };
}

export interface PortfolioSummaryTotals {
  accounts: AccountSummary[];
  marketValue: number;
  invested: number;
  withdrawn: number;
  realized: number;
  unrealized: number;
  pnl: number;
  /** XIRR по объединённому потоку всех счетов */
  xirr: number | null;
  xirrReliable: boolean;
  /** Счета без данных о пополнениях: их P&L и XIRR не учитываются */
  pnlUnknownAccounts: number;
  /** Доли по счетам, в долях от общей стоимости */
  allocationByAccount: { id: string; label: string; value: number; share: number }[];
  allocationByTicker: { ticker: string; name: string; value: number; share: number }[];
}

export function summarizePortfolio(
  accounts: BrokerAccountSource[],
  options: { asOf?: string } = {},
): PortfolioSummaryTotals {
  const summaries = accounts.map((account) => summarizeAccount(account, options));

  const marketValue = summaries.reduce((sum, item) => sum + item.marketValue, 0);
  const invested = summaries.reduce((sum, item) => sum + item.invested, 0);
  const withdrawn = summaries.reduce((sum, item) => sum + item.withdrawn, 0);
  const realized = summaries.reduce((sum, item) => sum + item.realized, 0);
  const unrealized = summaries.reduce((sum, item) => sum + item.unrealized, 0);

  // P&L и XIRR считаем только по счетам с известными пополнениями
  const knownAccounts = summaries.filter((item) => item.investedKnown);
  const unknownAccounts = summaries.filter((item) => !item.investedKnown);
  const knownValue = knownAccounts.reduce((sum, item) => sum + item.marketValue, 0);
  const pnl = knownAccounts.reduce((sum, item) => sum + item.pnl, 0);

  const asOf =
    options.asOf ??
    summaries
      .map((item) => item.periodEnd)
      .filter(Boolean)
      .sort((a, b) => (toDayNumber(a) ?? 0) - (toDayNumber(b) ?? 0))
      .pop() ??
    new Date().toISOString().slice(0, 10);

  // Объединённый поток: пополнения минус, выводы плюс, остаток портфеля — терминальный плюс.
  // Берём только счета с известными пополнениями, иначе остаток «в воздухе» ломает XIRR.
  const combinedFlows: CashFlowPoint[] = knownAccounts.flatMap((item) =>
    item.flows.map((flow) => ({
      date: flow.date,
      amount:
        flow.direction === "deposit"
          ? -Math.abs(flow.amount)
          : Math.abs(flow.amount),
    })),
  );
  combinedFlows.push({ date: asOf, amount: Math.abs(knownValue) });
  const rate = xirr(combinedFlows);

  const firstDate = summaries
    .flatMap((item) => item.flows.map((flow) => flow.date))
    .sort((a, b) => (toDayNumber(a) ?? 0) - (toDayNumber(b) ?? 0))[0];
  const historyDays = firstDate ? daysBetween(firstDate, asOf) : 0;

  const allocationByAccount = summaries.map((item) => ({
    id: item.id,
    label: item.label,
    value: item.marketValue,
    share: marketValue > 0 ? item.marketValue / marketValue : 0,
  }));

  const tickerTotals = new Map<string, { name: string; value: number }>();
  for (const account of accounts) {
    for (const position of account.report.securities ?? []) {
      const key = position.isin || position.name;
      const current = tickerTotals.get(key) ?? { name: position.name, value: 0 };
      current.value += (position.valueEnd || 0) + (position.nkdEnd || 0);
      tickerTotals.set(key, current);
    }
  }
  const allocationByTicker = [...tickerTotals.entries()]
    .map(([key, item]) => ({
      ticker: key,
      name: item.name,
      value: item.value,
      share: marketValue > 0 ? item.value / marketValue : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    accounts: summaries,
    marketValue,
    invested,
    withdrawn,
    realized,
    unrealized,
    pnl,
    xirr: rate,
    xirrReliable:
      rate !== null && historyDays >= 60 && unknownAccounts.length === 0,
    pnlUnknownAccounts: unknownAccounts.length,
    allocationByAccount,
    allocationByTicker,
  };
}
