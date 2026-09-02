export type BenchmarkGroup = "core" | "sector" | "bonds" | "fx";

export interface BenchmarkDefinition {
  id: string;
  label: string;
  group: BenchmarkGroup;
  source: "moex" | "cbr";
  /** Для CBR: CharCode валюты */
  currencyCode?: "USD" | "EUR" | "CNY";
}

export const MOEX_BENCHMARKS: BenchmarkDefinition[] = [
  { id: "IMOEX", label: "Индекс МосБиржи", group: "core", source: "moex" },
  { id: "MOEX10", label: "MOEX 10", group: "core", source: "moex" },
  { id: "MOEXBC", label: "Голубые фишки", group: "core", source: "moex" },
  { id: "RTSI", label: "Индекс RTS", group: "core", source: "moex" },
  { id: "MOEXOG", label: "Нефть и газ", group: "sector", source: "moex" },
  { id: "MOEXFN", label: "Финансы", group: "sector", source: "moex" },
  { id: "MOEXMM", label: "Металлы и добыча", group: "sector", source: "moex" },
  { id: "MOEXIT", label: "IT", group: "sector", source: "moex" },
  { id: "MOEXCN", label: "Потребительский", group: "sector", source: "moex" },
  { id: "MOEXCH", label: "Химия и нефтехимия", group: "sector", source: "moex" },
  { id: "MOEXEU", label: "Электроэнергетика", group: "sector", source: "moex" },
  { id: "MOEXTL", label: "Транспорт", group: "sector", source: "moex" },
  { id: "MOEXRE", label: "Недвижимость", group: "sector", source: "moex" },
  { id: "RGBI", label: "Гособлигации (RGBI)", group: "bonds", source: "moex" },
];

export const CBR_BENCHMARKS: BenchmarkDefinition[] = [
  { id: "USD", label: "USD/RUB (ЦБ)", group: "fx", source: "cbr", currencyCode: "USD" },
  { id: "EUR", label: "EUR/RUB (ЦБ)", group: "fx", source: "cbr", currencyCode: "EUR" },
  { id: "CNY", label: "CNY/RUB (ЦБ)", group: "fx", source: "cbr", currencyCode: "CNY" },
];

export const ALL_BENCHMARKS: BenchmarkDefinition[] = [
  ...MOEX_BENCHMARKS,
  ...CBR_BENCHMARKS,
];

export const BENCHMARK_GROUP_LABELS: Record<BenchmarkGroup, string> = {
  core: "Основные индексы",
  sector: "Сектора",
  bonds: "Облигации",
  fx: "Валюты ЦБ",
};
