import type { LayerTargets } from "@/lib/resilience-plan";

export const JOURNEY_CATALOG_VERSION = 1 as const;

export type MilestoneId =
  | "baseline-data-quality"
  | "cash-flow-control"
  | "operational-buffer"
  | "starter-emergency-fund"
  | "core-emergency-fund"
  | "extended-emergency-fund"
  | "debt-liquidity-tradeoff"
  | "sinking-funds"
  | "experiences-fund"
  | "sustainable-contributions"
  | "capital-milestones"
  | "plan-vs-fact-review";

export type HouseholdVariant = "solo" | "couple" | "dependents";

export type BranchCondition =
  | "extended-reserve-recommended"
  | "has-debt"
  | "has-sinking-funds"
  | "always";

export interface BabyStepDefinition {
  id: string;
  title: string;
  description: string;
}

export interface MilestoneDefinition {
  id: MilestoneId;
  catalogVersion: typeof JOURNEY_CATALOG_VERSION;
  title: string;
  description: string;
  babySteps: BabyStepDefinition[];
  resilienceLayerId?: keyof LayerTargets;
  prerequisiteIds: MilestoneId[];
  branchCondition: BranchCondition;
  optional?: boolean;
  householdCopy: Record<HouseholdVariant, string>;
}

export const JOURNEY_MILESTONES: MilestoneDefinition[] = [
  {
    id: "baseline-data-quality",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Базовая картина",
    description:
      "Соберите честную базу: обязательные и дискреционные расходы, ликвидность и цикл выплат.",
    prerequisiteIds: [],
    branchCondition: "always",
    babySteps: [
      {
        id: "mandatory-expenses",
        title: "Обязательные расходы",
        description: "Укажите ежемесячные обязательные траты без округления «на глаз».",
      },
      {
        id: "liquid-assets",
        title: "Доступная ликвидность",
        description: "Отметьте сумму, которую можно использовать без штрафов и задержек.",
      },
      {
        id: "household-profile",
        title: "Профиль домохозяйства",
        description: "Уточните стабильность дохода, иждивенцев и страховое покрытие.",
      },
    ],
    householdCopy: {
      solo: "Один доход — важнее точность обязательных расходов.",
      couple: "Два дохода — согласуйте, какие траты считать общими.",
      dependents: "С иждивенцами — включите их обязательные расходы в базу.",
    },
  },
  {
    id: "cash-flow-control",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Контроль денежного потока",
    description:
      "Понимайте, сколько остаётся после обязательных трат и куда уходит профицит.",
    prerequisiteIds: ["baseline-data-quality"],
    branchCondition: "always",
    babySteps: [
      {
        id: "surplus-positive",
        title: "Профицит или дефицит",
        description: "Зафиксируйте ежемесячный остаток после обязательных платежей.",
      },
      {
        id: "discretionary-budget",
        title: "Дискреционный бюджет",
        description: "Отделите необязательные траты от резервов и целей.",
      },
    ],
    householdCopy: {
      solo: "Контроль потока начинается с одного регулярного обзора.",
      couple: "Согласуйте, как делить дискреционные траты между партнёрами.",
      dependents: "Учитывайте переменные расходы на детей в дискреционной части.",
    },
  },
  {
    id: "operational-buffer",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Операционный буфер",
    description: "Покройте обязательные расходы между поступлениями дохода.",
    prerequisiteIds: ["cash-flow-control"],
    branchCondition: "always",
    resilienceLayerId: "operationalBuffer",
    babySteps: [
      {
        id: "pay-cycle-gap",
        title: "Разрыв между выплатами",
        description: "Сверьте буфер с длиной платёжного цикла.",
      },
      {
        id: "debt-payments-cushion",
        title: "Подушка под долговые платежи",
        description: "Добавьте небольшой запас на регулярные долговые обязательства.",
      },
    ],
    householdCopy: {
      solo: "Буфер закрывает паузу между зарплатами без кредита.",
      couple: "При разных циклах выплат буфер сглаживает кассовые разрывы.",
      dependents: "С иждивенцами буфер должен покрывать и их срочные нужды.",
    },
  },
  {
    id: "starter-emergency-fund",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Стартовый резерв",
    description: "Первый защитный слой на непредвиденные обязательные расходы.",
    prerequisiteIds: ["operational-buffer"],
    branchCondition: "always",
    resilienceLayerId: "starterEmergencyFund",
    babySteps: [
      {
        id: "starter-target",
        title: "Ориентир стартового слоя",
        description: "Сравните ликвидность с рекомендованным стартовым резервом.",
      },
      {
        id: "starter-funded",
        title: "Стартовый слой сформирован",
        description: "Достигните ориентира по стартовому резерву без заимствований.",
      },
    ],
    householdCopy: {
      solo: "Один доход — стартовый резерв обычно шире.",
      couple: "Второй доход снижает минимальный стартовый ориентир.",
      dependents: "Иждивенцы увеличивают потребность в быстром доступе к резерву.",
    },
  },
  {
    id: "core-emergency-fund",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Базовый резерв",
    description: "Основной запас на потерю дохода с учётом профиля риска.",
    prerequisiteIds: ["starter-emergency-fund"],
    branchCondition: "always",
    resilienceLayerId: "coreReserve",
    babySteps: [
      {
        id: "core-months",
        title: "Месяцы покрытия",
        description: "Оцените, на сколько месяцев обязательных трат хватает ликвидности.",
      },
      {
        id: "core-target",
        title: "Ориентир базового слоя",
        description: "Сверьте прогресс с рекомендованным базовым резервом.",
      },
    ],
    householdCopy: {
      solo: "Поиск работы и один источник дохода расширяют базовый ориентир.",
      couple: "Два дохода сужают рекомендуемый базовый слой, но не отменяют его.",
      dependents: "Каждый иждивенец добавляет к рекомендованному базовому резерву.",
    },
  },
  {
    id: "extended-emergency-fund",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Расширенный резерв",
    description:
      "Дополнительный слой при повышенном домохозяйственном риске. Можно пропустить.",
    prerequisiteIds: ["core-emergency-fund"],
    branchCondition: "extended-reserve-recommended",
    optional: true,
    resilienceLayerId: "extendedReserve",
    babySteps: [
      {
        id: "extended-assess",
        title: "Оценка необходимости",
        description: "Проверьте, рекомендует ли профиль расширенный слой.",
      },
      {
        id: "extended-funded",
        title: "Расширенный слой",
        description: "Накопите ориентир расширенного резерва или осознанно отложите.",
      },
    ],
    householdCopy: {
      solo: "Нестабильный доход или длительный поиск работы — повод для расширенного слоя.",
      couple: "Если оба дохода рискованны, расширенный слой становится актуальнее.",
      dependents: "Иждивенцы и слабое страхование усиливают аргумент за расширенный резерв.",
    },
  },
  {
    id: "debt-liquidity-tradeoff",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Долг и ликвидность",
    description:
      "Сравните ускоренное погашение с риском более тонкого резерва — без «правильного» ответа.",
    prerequisiteIds: ["starter-emergency-fund"],
    branchCondition: "has-debt",
    optional: true,
    babySteps: [
      {
        id: "debt-service-ratio",
        title: "Долговая нагрузка",
        description: "Оцените долю обязательных платежей в обязательных расходах.",
      },
      {
        id: "liquidity-vs-payoff",
        title: "Компромисс",
        description: "Смоделируйте сценарий потери дохода с текущими долговыми платежами.",
      },
    ],
    householdCopy: {
      solo: "При одном доходе компромисс между долгом и резервом особенно чувствителен.",
      couple: "Второй доход может позволить более агрессивное погашение — но не всегда.",
      dependents: "Иждивенцы часто смещают баланс в сторону более толстого резерва.",
    },
  },
  {
    id: "sinking-funds",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Целевые накопления",
    description: "Отдельные фонды на планируемые нерегулярные расходы.",
    prerequisiteIds: ["cash-flow-control"],
    branchCondition: "has-sinking-funds",
    resilienceLayerId: "sinkingFunds",
    babySteps: [
      {
        id: "define-goals",
        title: "Список целей",
        description: "Добавьте хотя бы одну целевую накопительную цель.",
      },
      {
        id: "fund-progress",
        title: "Прогресс по фондам",
        description: "Отслеживайте накопление отдельно от аварийного резерва.",
      },
    ],
    householdCopy: {
      solo: "Целевые фонды не конкурируют с операционным буфером.",
      couple: "Распределите приоритеты целей между партнёрами.",
      dependents: "Школа, кружки и сезонные траты — типичные целевые фонды.",
    },
  },
  {
    id: "experiences-fund",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Фонд впечатлений",
    description: "Качество жизни отдельно от аварийных резервов.",
    prerequisiteIds: ["cash-flow-control"],
    branchCondition: "always",
    optional: true,
    resilienceLayerId: "experiencesFund",
    babySteps: [
      {
        id: "annual-target",
        title: "Годовой ориентир",
        description: "Задайте реалистичный годовой ориентир на впечатления.",
      },
      {
        id: "experiences-funded",
        title: "Отдельный фонд",
        description: "Копите на впечатления, не трогая аварийный резерв.",
      },
    ],
    householdCopy: {
      solo: "Небольшой отдельный фонд снижает соблазн тратить резерв на отдых.",
      couple: "Совместные цели впечатлений проще планировать отдельным фондом.",
      dependents: "Семейные поездки и праздники — часть фонда впечатлений.",
    },
  },
  {
    id: "sustainable-contributions",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Устойчивые взносы",
    description:
      "Регулярные взносы в резервы и цели в пределах комфортного профицита.",
    prerequisiteIds: ["operational-buffer"],
    branchCondition: "always",
    babySteps: [
      {
        id: "surplus-allocation",
        title: "Распределение профицита",
        description: "Направляйте часть профицита на следующий ориентир.",
      },
      {
        id: "sustainable-rate",
        title: "Комфортный темп",
        description: "Взнос не должен съедать операционный буфер.",
      },
    ],
    householdCopy: {
      solo: "Устойчивость важнее скорости — темп можно снизить без «штрафа».",
      couple: "Согласуйте доли взносов, если профицит формируется по-разному.",
      dependents: "С иждивенцами оставляйте запас на переменные траты.",
    },
  },
  {
    id: "capital-milestones",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "Капитальные ориентиры",
    description:
      "Широкие ориентиры по накопленному капиталу — без обещаний доходности.",
    prerequisiteIds: ["core-emergency-fund", "sustainable-contributions"],
    branchCondition: "always",
    babySteps: [
      {
        id: "total-liquidity",
        title: "Совокупная ликвидность",
        description: "Суммируйте резервы и целевые фонды как ориентир, не как цель рынка.",
      },
      {
        id: "gap-to-target",
        title: "Разрыв до ориентира",
        description: "Отслеживайте разрыв до рекомендованного совокупного слоя.",
      },
    ],
    householdCopy: {
      solo: "Капитальные ориентиры — про устойчивость, не про сравнение с другими.",
      couple: "Общий ориентир складывается из резервов обоих партнёров.",
      dependents: "Семейный ориентир шире за счёт расширенных резервных слоёв.",
    },
  },
  {
    id: "plan-vs-fact-review",
    catalogVersion: JOURNEY_CATALOG_VERSION,
    title: "План и факт",
    description:
      "Периодический обзор: что изменилось в расходах, доходах и ориентирах.",
    prerequisiteIds: ["baseline-data-quality"],
    branchCondition: "always",
    babySteps: [
      {
        id: "schedule-review",
        title: "Запланировать обзор",
        description: "Выберите удобный ритм — раз в месяц или квартал.",
      },
      {
        id: "record-review",
        title: "Зафиксировать обзор",
        description: "Отметьте, что данные в карте устойчивости актуальны.",
      },
    ],
    householdCopy: {
      solo: "Обзор без стыда: цель — актуальная картина, не идеальный streak.",
      couple: "Совместный обзор помогает синхронизировать базовые цифры.",
      dependents: "После изменений в семье обновите профиль иждивенцев.",
    },
  },
];

const milestoneById = new Map(
  JOURNEY_MILESTONES.map((milestone) => [milestone.id, milestone]),
);

export function getMilestoneDefinition(
  id: MilestoneId,
): MilestoneDefinition | undefined {
  return milestoneById.get(id);
}

export function defaultMilestoneOrder(): MilestoneId[] {
  return JOURNEY_MILESTONES.map((milestone) => milestone.id);
}
