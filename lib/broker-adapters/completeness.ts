import type {
  BrokerImportCoverage,
  BrokerImportReconciliation,
  BrokerImportWarning,
} from "./types";

export type BrokerImportGapCode =
  | "RECONCILIATION_MISMATCH"
  | "MISSING_META"
  | "DROPPED_ROWS"
  | "PARTIAL_PARSE";

export interface BrokerImportGap {
  code: BrokerImportGapCode;
  message: string;
}

export interface BrokerImportCompleteness {
  complete: boolean;
  gaps: BrokerImportGap[];
}

const DROPPED_ROW_CODES = new Set([
  "INVALID_NUMBER",
  "SKIPPED_ROW",
  "MISSING_TABLE",
]);

export function assessBrokerImportCompleteness(input: {
  coverage: BrokerImportCoverage | null;
  reconciliation: BrokerImportReconciliation | null;
  warnings: BrokerImportWarning[];
}): BrokerImportCompleteness {
  const gaps: BrokerImportGap[] = [];

  if (input.reconciliation && !input.reconciliation.withinTolerance) {
    gaps.push({
      code: "RECONCILIATION_MISMATCH",
      message:
        "Итоги брокера и расчёт расходятся больше чем на 1 ₽. Нулевые значения вместо неизвестных полей не подставлялись.",
    });
  }

  if (input.coverage && !input.coverage.meta) {
    gaps.push({
      code: "MISSING_META",
      message: "В отчёте нет периода. Сверка дат плана и факта будет неполной.",
    });
  }

  if (input.warnings.some((warning) => warning.code === "PARTIAL_PARSE")) {
    gaps.push({
      code: "PARTIAL_PARSE",
      message: "Адаптер разобрал отчёт лишь частично. Проверьте покрытие разделов.",
    });
  }

  const dropped = input.warnings.filter((warning) =>
    DROPPED_ROW_CODES.has(warning.code),
  );
  if (dropped.length > 0) {
    gaps.push({
      code: "DROPPED_ROWS",
      message: `Пропущены или не разобраны строки (${dropped.length}). Их суммы не заменялись нулями.`,
    });
  }

  return {
    complete: gaps.length === 0,
    gaps,
  };
}
