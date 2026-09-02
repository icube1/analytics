import { createTermDeposit } from "@/lib/custom-assets";
import { collectUpcomingEvents } from "@/lib/upcoming-events";
import type { CustomAssets } from "@/lib/portfolio-types";

describe("upcoming events", () => {
  it("collects deposit maturity and debt payoff events sorted by date", () => {
    const assets: CustomAssets = {
      items: [
        createTermDeposit({
          id: "dep",
          label: "Вклад 25%",
          value: 500_000,
          depositOpenedAt: "2026-03-01",
          depositTermMonths: 6,
        }),
        {
          id: "apt",
          enabled: true,
          label: "Квартира",
          assetKind: "standard",
          value: 3_000_000,
          debt: 2_000_000,
          monthlyDebtPayment: 55_000,
          debtAnnualRate: 10,
          debtPaymentDay: 6,
          growsWithInflation: false,
          returnMode: "none",
          annualReturnPercent: 0,
          incomeAmount: 0,
          incomePeriod: "monthly",
          generatesDividendTax: false,
          notes: "",
        },
      ],
      otherDebts: [],
    };

    const events = collectUpcomingEvents(assets, new Date(2026, 2, 15));
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].dateIso <= events[1].dateIso).toBe(true);

    const deposit = events.find((event) => event.kind === "deposit_maturity");
    expect(deposit?.label).toBe("Вклад 25%");
    expect(deposit?.payoutAmount).toBeGreaterThan(500_000);

    const debt = events.find((event) => event.kind === "debt_payoff");
    expect(debt?.monthlyAmount).toBe(55_000);
    expect(debt?.paymentsRemaining).toBeGreaterThan(0);
  });
});
