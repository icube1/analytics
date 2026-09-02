import type { LayerTargets } from "@/lib/resilience-plan";
import { formatCoveragePercent, formatRub } from "@/lib/resilience-format";

export interface LayerDefinition {
  id: keyof LayerTargets;
  title: string;
  description: string;
  optional?: boolean;
}

export const RESILIENCE_LAYERS: LayerDefinition[] = [
  {
    id: "operationalBuffer",
    title: "Операционный буфер",
    description:
      "Деньги на обязательные расходы между поступлениями дохода и небольшой запас на долговые платежи.",
  },
  {
    id: "starterEmergencyFund",
    title: "Стартовый резерв",
    description:
      "Первый защитный слой на непредвиденные обязательные расходы без кредита.",
  },
  {
    id: "coreReserve",
    title: "Базовый резерв",
    description:
      "Основной запас на потерю дохода с учётом стабильности, зависимых и долговой нагрузки.",
  },
  {
    id: "extendedReserve",
    title: "Расширенный резерв",
    description:
      "Дополнительный слой для повышенного домохозяйственного риска. Может быть нулевым.",
    optional: true,
  },
  {
    id: "sinkingFunds",
    title: "Целевые накопления",
    description:
      "Отдельные фонды на планируемые нерегулярные расходы: ремонт, налоги, обслуживание.",
  },
  {
    id: "experiencesFund",
    title: "Фонд впечатлений",
    description:
      "Качество жизни и цели, отделённые от аварийных резервов.",
  },
];

export function layerCoveragePercent(
  layerId: keyof LayerTargets,
  coverage: Record<string, number>,
): number {
  const keyMap: Record<keyof LayerTargets, string> = {
    operationalBuffer: "operationalBufferPercent",
    starterEmergencyFund: "starterEmergencyPercent",
    coreReserve: "coreReservePercent",
    extendedReserve: "extendedReservePercent",
    sinkingFunds: "sinkingFundsPercent",
    experiencesFund: "experiencesFundPercent",
  };
  return coverage[keyMap[layerId]] ?? 0;
}

export function layerStatusLabel(percent: number, recommended: number): string {
  if (recommended <= 0) {
    return "Не требуется для текущего профиля";
  }
  if (percent >= 100) {
    return "Ориентир достигнут";
  }
  if (percent >= 50) {
    return "Частичное покрытие";
  }
  return "Следующий ориентир";
}

export function formatLayerRange(recommended: number): string {
  return formatRub(recommended);
}

export function formatCoverageSummary(percent: number): string {
  return formatCoveragePercent(percent);
}
