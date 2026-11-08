/**
 * НДФЛ по основной налоговой базе (зарплата, ГПХ, прочие доходы) — нужен только
 * для того, чтобы понять ставку налогоплательщика и сколько налога он реально
 * уплатил: от этого зависит размер вычета по ИИС-3.
 *
 * Шкала с 2025 года (ст. 224 п. 1 НК РФ): 13% до 2,4 млн ₽, 15% до 5 млн,
 * 18% до 20 млн, 20% до 50 млн, 22% свыше.
 */
import { ndflBroker, type NdflResult } from "./tax";

const SCALE: { upTo: number; rate: number }[] = [
  { upTo: 2_400_000, rate: 0.13 },
  { upTo: 5_000_000, rate: 0.15 },
  { upTo: 20_000_000, rate: 0.18 },
  { upTo: 50_000_000, rate: 0.2 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.22 },
];

/** НДФЛ по прогрессивной шкале основной базы. */
export function ndflPersonal(annualIncome: number): NdflResult {
  const income = Math.max(0, Number.isFinite(annualIncome) ? annualIncome : 0);
  if (income === 0) return { bands: [], total: 0 };

  const bands: NdflResult["bands"] = [];
  let previous = 0;
  for (const step of SCALE) {
    if (income <= previous) break;
    const base = Math.min(income, step.upTo) - previous;
    if (base > 0) {
      bands.push({ rate: step.rate, base, tax: base * step.rate });
    }
    previous = step.upTo;
  }
  return { bands, total: bands.reduce((sum, band) => sum + band.tax, 0) };
}

/** Ставка, которая применяется к последнему рублю дохода. */
export function marginalNdflRate(annualIncome: number): number {
  const income = Math.max(0, annualIncome || 0);
  for (const step of SCALE) {
    if (income <= step.upTo) return step.rate;
  }
  return 0.22;
}

/**
 * Сценарий по ИИС-3: сколько вернут при заданном доходе и взносах.
 * Возврат = min(взносы; 400 000) × ставка, но не больше уплаченного НДФЛ.
 */
export function iisScenario(params: {
  annualIncome: number;
  deposits: number;
}): {
  rate: number;
  ndflTotal: number;
  refund: number;
  limitReason: "limit" | "paid-tax" | "none";
} {
  const { total } = ndflPersonal(params.annualIncome);
  const rate = marginalNdflRate(params.annualIncome);
  const eligible = Math.min(Math.max(0, params.deposits), 400_000);
  const raw = eligible * rate;
  const refund = Math.min(raw, total);
  const limitReason: "limit" | "paid-tax" | "none" =
    params.deposits > 400_000 && raw <= total
      ? "limit"
      : refund < raw
        ? "paid-tax"
        : "none";
  return { rate, ndflTotal: total, refund, limitReason };
}

/** Для обратной совместимости с брокерским расчётом. */
export { ndflBroker };
