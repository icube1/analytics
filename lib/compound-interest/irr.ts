/** IRR по месячным потокам → годовая ставка, % */
export function annualizedIrr(cashFlows: number[]): number {
  if (cashFlows.length < 2) return 0;

  let rate = 0.01;
  for (let i = 0; i < 64; i++) {
    let npv = 0;
    let derivative = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const factor = (1 + rate) ** t;
      npv += cashFlows[t] / factor;
      if (t > 0) {
        derivative -= (t * cashFlows[t]) / ((1 + rate) ** (t + 1));
      }
    }
    if (Math.abs(derivative) < 1e-12) break;
    const next = rate - npv / derivative;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-9) {
      rate = next;
      break;
    }
    rate = next;
  }

  if (!Number.isFinite(rate)) return 0;
  return ((1 + rate) ** 12 - 1) * 100;
}
