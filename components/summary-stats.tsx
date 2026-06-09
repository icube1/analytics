"use client";

import { StatCard } from "@/components/stat-card";
import { formatMoney } from "@/lib/stats";
import type { SummaryStats } from "@/lib/types";

interface SummaryStatsProps {
  stats: SummaryStats;
}

export function SummaryStatsCards({ stats }: SummaryStatsProps) {
  return (
    <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11.5rem,1fr))]">
      <StatCard
        label="Поступления"
        value={formatMoney(stats.totalIncome)}
        tone="income"
      />
      <StatCard
        label="Расходы"
        value={formatMoney(stats.totalExpense)}
        tone="expense"
      />
      <StatCard
        label="Сальдо"
        value={formatMoney(stats.netFlow)}
        tone={stats.netFlow >= 0 ? "income" : "expense"}
      />
      <StatCard label="Операций" value={String(stats.transactionCount)} />
      <StatCard
        label="Средний расход"
        value={formatMoney(stats.avgExpense)}
        tone="accent"
      />
      <StatCard
        label="Бонусы"
        value={formatMoney(stats.totalBonus)}
        tone="accent"
      />
    </section>
  );
}
