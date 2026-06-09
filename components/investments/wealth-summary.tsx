"use client";

import { StatCard } from "@/components/stat-card";
import { formatMoney } from "@/lib/stats";

interface WealthSummaryProps {
  wealth: ReturnType<
    typeof import("@/lib/portfolio-wealth").getTotalWealth
  >;
}

export function WealthSummary({ wealth }: WealthSummaryProps) {
  return (
    <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11.5rem,1fr))]">
      <StatCard
        label="Всего активов"
        value={formatMoney(wealth.grandTotal)}
        tone="accent"
      />
      <StatCard
        label="Брокерский счёт"
        value={formatMoney(wealth.brokerTotal)}
      />
      <StatCard
        label="Ценные бумаги"
        value={formatMoney(wealth.brokerSecurities)}
      />
      <StatCard
        label="Деньги + золото (брокер)"
        value={formatMoney(wealth.brokerCashRub + wealth.brokerGoldRub)}
      />
      <StatCard
        label="Другие активы"
        value={formatMoney(wealth.customTotal)}
        tone="income"
      />
      {wealth.totalDebt > 0 && (
        <>
          <StatCard
            label="Совокупный долг"
            value={formatMoney(wealth.totalDebt)}
            tone="expense"
          />
          <StatCard
            label="Платежи по долгам / мес"
            value={formatMoney(wealth.monthlyDebtService)}
            tone="expense"
          />
        </>
      )}
    </section>
  );
}
