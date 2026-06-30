"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartMoneyTooltip } from "@/components/chart-money-tooltip";
import { CHART_COLORS } from "@/lib/stats";
import { formatMoney } from "@/lib/portfolio-wealth";
import type { BrokerReport } from "@/lib/portfolio-types";

interface PortfolioTabProps {
  report: BrokerReport | null;
  onUpload: (file: File) => void;
  fileName: string;
}

export function PortfolioTab({ report, onUpload, fileName }: PortfolioTabProps) {
  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <p className="text-zinc-500 dark:text-zinc-400">
          Загрузите отчёт брокера СберИнвестиций (HTML)
        </p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          Кнопка ниже или перетащите файл в окно браузера
        </p>
        <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
          <input
            type="file"
            accept=".html,.htm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          Выбрать файл
        </label>
      </div>
    );
  }

  const allocation = report.securities.map((s) => ({
    id: s.id,
    name: s.name,
    value: s.valueEnd,
  }));

  const pieTotal = allocation.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {report.investor} · договор {report.contract}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Период {report.periodStart} — {report.periodEnd} · файл: {fileName}
          </p>
        </div>
        <label className="inline-flex cursor-pointer rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="file"
            accept=".html,.htm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          Загрузить отчёт
        </label>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Активы на конец", value: report.assetsEnd },
          { label: "Изменение", value: report.assetsChange },
          { label: "Ценные бумаги", value: report.securitiesEnd },
          { label: "Денежные средства", value: report.cashEnd },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.label}</p>
            <p
              className={`mt-1 text-xl font-semibold tabular-nums ${
                item.label === "Изменение" && item.value < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-zinc-900 dark:text-zinc-100"
              }`}
            >
              {formatMoney(item.value)}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">
            Доли в портфеле
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={allocation}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={95}
                innerRadius={45}
                stroke="none"
                paddingAngle={1}
                activeShape={false}
              >
                {allocation.map((item, index) => (
                  <Cell
                    key={item.id}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip cursor={false} content={<ChartMoneyTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">
            Денежные остатки
          </h3>
          <div className="space-y-2">
            {report.cash.map((c) => (
              <div
                key={`${c.platform}-${c.currency}`}
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950"
              >
                <span className="text-zinc-700 dark:text-zinc-300">
                  {c.currency}
                  {c.rateEnd > 0 && ` · курс ${c.rateEnd.toLocaleString("ru-RU")}`}
                </span>
                <span className="font-medium tabular-nums">
                  {c.end.toLocaleString("ru-RU")} {c.currency}
                  {c.currency === "GLD" && c.rateEnd > 0 && (
                    <span className="ml-2 text-zinc-500">
                      ≈ {formatMoney(c.end * c.rateEnd)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3 className="font-semibold">Позиции</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Бумага</th>
                <th className="px-4 py-3">ISIN</th>
                <th className="px-4 py-3 text-right">Кол-во</th>
                <th className="px-4 py-3 text-right">Цена</th>
                <th className="px-4 py-3 text-right">Стоимость</th>
                <th className="px-4 py-3 text-right">Доля</th>
                <th className="px-4 py-3 text-right">Изменение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {report.securities.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{s.isin}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.quantityEnd}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(s.priceEnd)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(s.valueEnd)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {pieTotal > 0
                      ? `${((s.valueEnd / pieTotal) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      s.valueChange < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {formatMoney(s.valueChange)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.trades.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3 className="font-semibold">Сделки за период</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Бумага</th>
                  <th className="px-4 py-3">Вид</th>
                  <th className="px-4 py-3 text-right">Кол-во</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {report.trades.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">{t.date}</td>
                    <td className="px-4 py-3">
                      {t.name}{" "}
                      <span className="text-zinc-500">({t.ticker})</span>
                    </td>
                    <td className="px-4 py-3">{t.side}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
