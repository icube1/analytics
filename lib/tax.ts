/**
 * Налоги РФ по брокерским счетам и ИИС-3 (правила 2025–2026).
 *
 * Источники: НК РФ ст. 210 п. 6, ст. 214.1, ст. 214.9, ст. 219.2, ст. 220.1,
 * ст. 224 п. 1, 1.1. Всё, что здесь считается — ОЦЕНКА для интерфейса, а не
 * налоговая декларация: точную сумму определяет налоговый агент/ФНС.
 *
 * Ключевое:
 *  • Доходы по ЦБ/ПФИ — отдельная база (п. 6 ст. 210). Ставка 13% до 2,4 млн ₽,
 *    свыше — 15%. Прогрессия 18/20/22% к брокерскому доходу НЕ применяется.
 *  • Убыток одного брокерского счёта сальдируется с прибылью другого у того же
 *    брокера, но НЕ с ИИС. Между разными брокерами — только через 3-НДФЛ.
 *  • Убыток по обращающимся ЦБ переносится 10 лет (только через 3-НДФЛ).
 *  • ИИС-3 даёт оба вычета: по взносам (лимит 400 000 ₽/год) и по доходу
 *    (до 30 млн ₽ при закрытии после минимального срока).
 */

/** Порог, после которого брокерский доход облагается 15% (ст. 224 п. 1.1 НК РФ) */
export const NDFL_BASE_THRESHOLD = 2_400_000;
export const NDFL_RATE_LOW = 0.13;
export const NDFL_RATE_HIGH = 0.15;

/** Лимит взносов для вычета по ИИС-3 (ст. 219.2 п. 2 пп. 1) */
export const IIS_CONTRIBUTION_LIMIT = 400_000;
/** Максимальный вычет по доходу на ИИС-3 (ст. 219.2 п. 3) */
export const IIS_INCOME_CAP = 30_000_000;
/** Срок переноса убытка по обращающимся ЦБ (ст. 220.1) */
export const LOSS_CARRY_YEARS = 10;

export interface TaxBand {
  rate: number;
  base: number;
  tax: number;
}

export interface NdflResult {
  bands: TaxBand[];
  total: number;
}

/** НДФЛ с брокерской базы: 13% до 2,4 млн ₽, 15% с превышения. */
export function ndflBroker(base: number): NdflResult {
  const amount = Math.max(0, Number.isFinite(base) ? base : 0);
  if (amount === 0) return { bands: [], total: 0 };

  const lowBase = Math.min(amount, NDFL_BASE_THRESHOLD);
  const highBase = Math.max(0, amount - NDFL_BASE_THRESHOLD);

  const bands: TaxBand[] = [
    {
      rate: NDFL_RATE_LOW,
      base: lowBase,
      tax: lowBase * NDFL_RATE_LOW,
    },
  ];
  if (highBase > 0) {
    bands.push({
      rate: NDFL_RATE_HIGH,
      base: highBase,
      tax: highBase * NDFL_RATE_HIGH,
    });
  }

  return { bands, total: bands.reduce((sum, band) => sum + band.tax, 0) };
}

/** Минимальный срок владения ИИС-3: 5 лет для 2024–2026, дальше +1 год до 10. */
export function iisMinimumHoldingYears(contractYear: number): number {
  if (contractYear <= 2026) return 5;
  return Math.min(10, 5 + (contractYear - 2026));
}

export interface IisContributionDeduction {
  /** Взносы, принятые к вычету (в пределах лимита) */
  eligible: number;
  /** Возврат НДФЛ, ₽ */
  refund: number;
  /** Ограничение по фактически уплаченному НДФЛ, если он известен */
  limitedByPaidTax: boolean;
}

/**
 * Вычет по взносам ИИС-3: min(взносы; 400 000) × ставка НДФЛ,
 * но не больше фактически уплаченного за год налога (если он передан).
 */
export function iisContributionDeduction(params: {
  deposits: number;
  ndflRate: number;
  paidNdfl?: number;
  limit?: number;
}): IisContributionDeduction {
  const limit = params.limit ?? IIS_CONTRIBUTION_LIMIT;
  const eligible = Math.max(0, Math.min(params.deposits, limit));
  const rate = Math.max(0, Math.min(params.ndflRate, 0.22));
  const raw = eligible * rate;

  if (params.paidNdfl === undefined) {
    return { eligible, refund: raw, limitedByPaidTax: false };
  }
  const paid = Math.max(0, params.paidNdfl);
  const refund = Math.min(raw, paid);
  return { eligible, refund, limitedByPaidTax: refund < raw };
}

export interface IisIncomeResult {
  /** Часть финреза, освобождённая вычетом по доходу */
  taxFree: number;
  taxable: number;
  tax: number;
  /** Вычет доступен только после минимального срока */
  deductionAvailable: boolean;
  minimumYears: number;
}

/**
 * Налог при закрытии ИИС-3. После минимального срока действует вычет по доходу
 * до 30 млн ₽; при досрочном закрытии он не применяется.
 */
export function iisClosureTax(params: {
  finResult: number;
  contractYear: number;
  heldYears: number;
}): IisIncomeResult {
  const minimumYears = iisMinimumHoldingYears(params.contractYear);
  const deductionAvailable = params.heldYears >= minimumYears;
  const finResult = Math.max(0, params.finResult);

  const taxFree = deductionAvailable
    ? Math.min(finResult, IIS_INCOME_CAP)
    : 0;
  const taxable = Math.max(0, finResult - taxFree);
  return {
    taxFree,
    taxable,
    tax: ndflBroker(taxable).total,
    deductionAvailable,
    minimumYears,
  };
}

/**
 * Возврат налога, полученного ранее по взносам, при досрочном закрытии ИИС-3
 * (ст. 219.2 п. 2 пп. 6): считается к уплате вместе с налогом на финрез.
 */
export function iisEarlyClosurePenalty(previousRefunds: number): number {
  return Math.max(0, previousRefunds);
}

export interface LossItem {
  year: string;
  amount: number;
}

export interface CarryForwardResult {
  /** Сколько убытка удалось зачесть в этом году */
  used: number;
  /** Налогооблагаемая база после зачёта */
  taxableBase: number;
  /** Остатки убытков, ещё не истёкшие */
  remaining: LossItem[];
  /** Убытки, у которых истёк 10-летний срок */
  expired: LossItem[];
}

/**
 * Перенос убытков прошлых лет: oldest-first, каждый убыток живёт 10 лет.
 * Применяется только к базе того же вида операций (в UI считаем, что вид один —
 * обращающиеся ЦБ).
 */
export function carryForwardLosses(
  losses: LossItem[],
  base: number,
  currentYear: number,
): CarryForwardResult {
  let taxableBase = Math.max(0, base);
  const remaining: LossItem[] = [];
  const expired: LossItem[] = [];
  let used = 0;

  const sorted = [...losses].sort((a, b) => a.year.localeCompare(b.year));
  for (const loss of sorted) {
    const lossYear = Number.parseInt(loss.year.slice(0, 4), 10);
    const age = Number.isFinite(lossYear) ? currentYear - lossYear : LOSS_CARRY_YEARS;
    if (age > LOSS_CARRY_YEARS) {
      expired.push(loss);
      continue;
    }
    const take = Math.min(Math.max(0, loss.amount), taxableBase);
    if (take > 0) {
      taxableBase -= take;
      used += take;
    }
    const left = Math.max(0, loss.amount - take);
    if (left > 0) remaining.push({ ...loss, amount: left });
  }

  return { used, taxableBase, remaining, expired };
}

/**
 * Сальдирование внутри одного брокера: суммы по всем его счетам складываются,
 * прибыль гасит убыток. ИИС в это не входит (ст. 214.9 п. 2).
 */
export function netBrokerResult(results: number[]): number {
  return results.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}
