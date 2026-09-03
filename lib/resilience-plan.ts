/**
 * TypeScript reference for finance-core resilience planning.
 * Mirrors `crates/finance-core/src/resilience/*` for differential tests.
 */

export type IncomeStability = "stable" | "variable" | "seasonal";
export type InsuranceCoverage = "low" | "medium" | "high";
export type RiskTolerance = "conservative" | "moderate" | "aggressive";

export interface HouseholdRiskInput {
  incomeStability: IncomeStability;
  incomeSourceCount: number;
  hasSecondaryHouseholdIncome: boolean;
  dependentCount: number;
  jobSearchMonths: number;
  insuranceCoverage: InsuranceCoverage;
  riskTolerance: RiskTolerance;
}

export interface DebtRiskInput {
  totalBalance: number;
  monthlyPayments: number;
  weightedAnnualRate: number;
  highInterestBalance: number;
}

export interface SinkingFundGoal {
  id: string;
  label: string;
  targetAmount: number;
  currentAmount: number;
  monthsUntilDue: number;
  priority: number;
}

export interface ExperiencesFundInput {
  annualTarget: number;
  currentAmount: number;
}

export interface ResilienceInput {
  mandatoryMonthlyExpenses: number;
  discretionaryMonthlyExpenses: number;
  liquidAssets: number;
  monthlySurplus: number;
  payCycleDays: number;
  household: HouseholdRiskInput;
  debt: DebtRiskInput;
  sinkingFunds: SinkingFundGoal[];
  experiences: ExperiencesFundInput;
}

export interface MoneyRange {
  min: number;
  recommended: number;
  max: number;
}

export interface LayerTargets {
  operationalBuffer: MoneyRange;
  starterEmergencyFund: MoneyRange;
  coreReserve: MoneyRange;
  extendedReserve: MoneyRange;
  sinkingFunds: MoneyRange;
  experiencesFund: MoneyRange;
}

export interface ReserveTotals {
  emergencyOnlyRecommended: number;
  allLayersRecommended: number;
  allLayersMax: number;
  currentGapToRecommended: number;
  monthsOfMandatoryExpensesCovered: number;
}

export interface CoverageSnapshot {
  operationalBufferPercent: number;
  starterEmergencyPercent: number;
  coreReservePercent: number;
  extendedReservePercent: number;
  sinkingFundsPercent: number;
  experiencesFundPercent: number;
  debtPaymentMonthsCovered: number;
}

export interface RiskAssessment {
  score: number;
  incomeStabilityPoints: number;
  incomeSourcePoints: number;
  householdIncomePoints: number;
  dependentPoints: number;
  jobSearchPoints: number;
  insurancePoints: number;
  debtServicePoints: number;
  highInterestDebtPoints: number;
  recommendsExtendedReserve: boolean;
}

export interface StressScenarioResult {
  id: string;
  label: string;
  monthsTested: number;
  survivable: boolean;
  shortfall: number;
  remainingLiquid: number;
  summary: string;
}

export type ExplanationDirection = "widen" | "narrow" | "neutral";

export interface Explanation {
  factor: string;
  effect: string;
  direction: ExplanationDirection;
}

export interface DescriptiveNote {
  topic: string;
  text: string;
}

export interface ResiliencePlan {
  layers: LayerTargets;
  totals: ReserveTotals;
  coverage: CoverageSnapshot;
  risk: RiskAssessment;
  stress: StressScenarioResult[];
  explanations: Explanation[];
  notes: DescriptiveNote[];
}

function assessRisk(
  household: HouseholdRiskInput,
  debt: DebtRiskInput,
  mandatoryMonthly: number,
): RiskAssessment {
  const incomeStabilityPoints =
    household.incomeStability === "stable"
      ? 0
      : household.incomeStability === "variable"
        ? 2
        : 3;
  const incomeSourcePoints =
    household.incomeSourceCount <= 1
      ? 2
      : household.incomeSourceCount === 2
        ? 1
        : 0;
  const householdIncomePoints = household.hasSecondaryHouseholdIncome ? 0 : 2;
  const dependentPoints = Math.min(household.dependentCount, 4);
  const jobSearchPoints =
    household.jobSearchMonths >= 9
      ? 3
      : household.jobSearchMonths >= 6
        ? 2
        : household.jobSearchMonths >= 3
          ? 1
          : 0;
  const insurancePoints =
    household.insuranceCoverage === "high"
      ? 0
      : household.insuranceCoverage === "medium"
        ? 1
        : 2;
  const debtServiceRatio =
    mandatoryMonthly > 0 ? debt.monthlyPayments / mandatoryMonthly : 0;
  const debtServicePoints =
    debtServiceRatio >= 0.5
      ? 3
      : debtServiceRatio >= 0.35
        ? 2
        : debtServiceRatio >= 0.2
          ? 1
          : 0;
  const highInterestDebtPoints =
    debt.highInterestBalance > 0
      ? debt.totalBalance > 0 &&
        debt.highInterestBalance / debt.totalBalance >= 0.5
        ? 2
        : 1
      : 0;
  const score =
    incomeStabilityPoints +
    incomeSourcePoints +
    householdIncomePoints +
    dependentPoints +
    jobSearchPoints +
    insurancePoints +
    debtServicePoints +
    highInterestDebtPoints;
  return {
    score,
    incomeStabilityPoints,
    incomeSourcePoints,
    householdIncomePoints,
    dependentPoints,
    jobSearchPoints,
    insurancePoints,
    debtServicePoints,
    highInterestDebtPoints,
    recommendsExtendedReserve: score >= 8,
  };
}

function toleranceCoreMonthAdjustment(tolerance: RiskTolerance): number {
  if (tolerance === "conservative") return 1;
  if (tolerance === "moderate") return 0;
  return -0.5;
}

function sinkingFundTarget(goal: SinkingFundGoal): number {
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  if (goal.monthsUntilDue === 0) {
    return Math.max(goal.targetAmount, goal.currentAmount);
  }
  return goal.currentAmount + remaining;
}

function percentOf(liquid: number, target: number): number {
  if (target <= 0) return 100;
  return Math.min(Math.max((liquid / target) * 100, 0), 999);
}

function operationalBufferRange(
  input: ResilienceInput,
  mandatory: number,
): MoneyRange {
  const payCycleFraction = Math.max(input.payCycleDays, 1) / 30;
  const debt = Math.max(input.debt.monthlyPayments, 0);
  return {
    min: mandatory * payCycleFraction * 0.75,
    recommended: mandatory * payCycleFraction + debt * 0.25,
    max: mandatory * payCycleFraction + debt,
  };
}

function starterEmergencyRange(
  input: ResilienceInput,
  mandatory: number,
): MoneyRange {
  let starterMonths = 1;
  if (!input.household.hasSecondaryHouseholdIncome) starterMonths += 0.5;
  if (mandatory > 0 && input.debt.monthlyPayments / mandatory >= 0.35) {
    starterMonths += 0.5;
  }
  starterMonths = Math.min(starterMonths, 2);
  return {
    min: mandatory * 0.5,
    recommended: mandatory * starterMonths,
    max: mandatory * 2,
  };
}

function coreReserveRange(
  input: ResilienceInput,
  mandatory: number,
  risk: RiskAssessment,
): MoneyRange {
  let coreMonths =
    3 + toleranceCoreMonthAdjustment(input.household.riskTolerance);
  coreMonths += risk.incomeStabilityPoints * 0.5;
  coreMonths += risk.householdIncomePoints * 0.5;
  coreMonths += risk.dependentPoints * 0.25;
  coreMonths += risk.jobSearchPoints * 0.5;
  coreMonths += risk.debtServicePoints * 0.25;
  coreMonths = Math.min(Math.max(coreMonths, 2), 12);
  return {
    min: mandatory * Math.max(coreMonths - 1, 1),
    recommended: mandatory * coreMonths,
    max: mandatory * (coreMonths + 2),
  };
}

function extendedReserveRange(
  mandatory: number,
  risk: RiskAssessment,
): MoneyRange {
  if (!risk.recommendsExtendedReserve) {
    return { min: 0, recommended: 0, max: mandatory * 2 };
  }
  const extra = risk.score >= 12 ? 6 : risk.score >= 10 ? 4 : 3;
  return {
    min: mandatory * Math.max(extra - 1, 1),
    recommended: mandatory * extra,
    max: mandatory * (extra + 2),
  };
}

function sinkingFundsRange(input: ResilienceInput): MoneyRange {
  const sinkingTarget = input.sinkingFunds.reduce(
    (sum, goal) => sum + sinkingFundTarget(goal),
    0,
  );
  const sinkingCurrent = input.sinkingFunds.reduce(
    (sum, goal) => sum + Math.max(goal.currentAmount, 0),
    0,
  );
  return {
    min: sinkingCurrent,
    recommended: Math.max(sinkingTarget, sinkingCurrent),
    max: sinkingTarget * 1.1,
  };
}

function experiencesFundRange(input: ResilienceInput): MoneyRange {
  const experiencesMonthly = Math.max(input.experiences.annualTarget, 0) / 12;
  return {
    min: experiencesMonthly * 3,
    recommended: Math.max(
      input.experiences.annualTarget,
      experiencesMonthly * 6,
    ),
    max: Math.max(
      input.experiences.annualTarget,
      experiencesMonthly * 12,
    ),
  };
}

function computeLayers(input: ResilienceInput): {
  layers: LayerTargets;
  totals: ReserveTotals;
  coverage: CoverageSnapshot;
  risk: RiskAssessment;
} {
  const mandatory = Math.max(input.mandatoryMonthlyExpenses, 0);
  const risk = assessRisk(input.household, input.debt, mandatory);
  const operationalBuffer = operationalBufferRange(input, mandatory);
  const starterEmergencyFund = starterEmergencyRange(input, mandatory);
  const coreReserve = coreReserveRange(input, mandatory, risk);
  const extendedReserve = extendedReserveRange(mandatory, risk);
  const sinkingFunds = sinkingFundsRange(input);
  const experiencesFund = experiencesFundRange(input);
  const layers: LayerTargets = {
    operationalBuffer,
    starterEmergencyFund,
    coreReserve,
    extendedReserve,
    sinkingFunds,
    experiencesFund,
  };
  const emergencyOnlyRecommended =
    operationalBuffer.recommended +
    starterEmergencyFund.recommended +
    coreReserve.recommended +
    extendedReserve.recommended;
  const allLayersRecommended =
    emergencyOnlyRecommended +
    sinkingFunds.recommended +
    experiencesFund.recommended;
  const allLayersMax =
    operationalBuffer.max +
    starterEmergencyFund.max +
    coreReserve.max +
    extendedReserve.max +
    sinkingFunds.max +
    experiencesFund.max;
  const liquid = Math.max(input.liquidAssets, 0);
  const totals: ReserveTotals = {
    emergencyOnlyRecommended,
    allLayersRecommended,
    allLayersMax,
    currentGapToRecommended: Math.max(allLayersRecommended - liquid, 0),
    monthsOfMandatoryExpensesCovered: mandatory > 0 ? liquid / mandatory : 0,
  };
  const coverage: CoverageSnapshot = {
    operationalBufferPercent: percentOf(
      liquid,
      operationalBuffer.recommended,
    ),
    starterEmergencyPercent: percentOf(
      liquid,
      starterEmergencyFund.recommended,
    ),
    coreReservePercent: percentOf(liquid, coreReserve.recommended),
    extendedReservePercent: percentOf(liquid, extendedReserve.recommended),
    sinkingFundsPercent: percentOf(liquid, sinkingFunds.recommended),
    experiencesFundPercent: percentOf(liquid, experiencesFund.recommended),
    debtPaymentMonthsCovered:
      input.debt.monthlyPayments > 0
        ? liquid / input.debt.monthlyPayments
        : Number.POSITIVE_INFINITY,
  };
  return { layers, totals, coverage, risk };
}

function runStressScenarios(input: ResilienceInput): StressScenarioResult[] {
  const scenarios = [
    incomeLoss(input, 1, "income-loss-1m", "One-month income interruption"),
    incomeLoss(input, 3, "income-loss-3m", "Three-month income interruption"),
    incomeLoss(input, 6, "income-loss-6m", "Six-month income interruption"),
    unexpectedExpense(input),
    incomeLossWithDebt(input),
    familyCareShock(input),
  ];
  if (input.household.hasSecondaryHouseholdIncome) {
    scenarios.push(partnerIncomeLoss(input));
  }
  return scenarios;
}

function incomeLoss(
  input: ResilienceInput,
  months: number,
  id: string,
  label: string,
): StressScenarioResult {
  const mandatory = Math.max(input.mandatoryMonthlyExpenses, 0);
  const burn = mandatory * months;
  const remaining = input.liquidAssets - burn;
  const survivable = remaining >= 0;
  const shortfall = Math.max(-remaining, 0);
  const summary = survivable
    ? `Liquid assets cover about ${months} month(s) of mandatory expenses without new income.`
    : `Mandatory expenses for ${months} month(s) exceed liquid assets by ${shortfall.toFixed(0)}.`;
  return {
    id,
    label,
    monthsTested: months,
    survivable,
    shortfall,
    remainingLiquid: Math.max(remaining, 0),
    summary,
  };
}

function unexpectedExpense(input: ResilienceInput): StressScenarioResult {
  const mandatory = Math.max(input.mandatoryMonthlyExpenses, 0);
  const shock = Math.max(mandatory, 10_000);
  const remaining = input.liquidAssets - shock;
  const survivable = remaining >= mandatory * 0.5;
  const shortfall = survivable ? 0 : Math.max(mandatory * 0.5 - remaining, 0);
  const summary = survivable
    ? `A one-time expense of about ${shock.toFixed(0)} leaves enough liquidity to keep a half-month operational cushion.`
    : `A one-time expense of about ${shock.toFixed(0)} would erode the operational buffer below a half-month cushion.`;
  return {
    id: "unexpected-expense",
    label: "Unexpected mandatory expense",
    monthsTested: 0,
    survivable,
    shortfall,
    remainingLiquid: Math.max(remaining, 0),
    summary,
  };
}

function incomeLossWithDebt(input: ResilienceInput): StressScenarioResult {
  const months = 3;
  const mandatory = Math.max(input.mandatoryMonthlyExpenses, 0);
  const debt = Math.max(input.debt.monthlyPayments, 0);
  const burn = (mandatory + debt) * months;
  const remaining = input.liquidAssets - burn;
  const survivable = remaining >= 0;
  const shortfall = Math.max(-remaining, 0);
  const summary = survivable
    ? `Liquid assets cover ${months} months of mandatory expenses plus scheduled debt payments.`
    : `Maintaining debt payments for ${months} months without income would require about ${shortfall.toFixed(0)} more liquidity.`;
  return {
    id: "income-loss-with-debt",
    label: "Income loss with ongoing debt payments",
    monthsTested: months,
    survivable,
    shortfall,
    remainingLiquid: Math.max(remaining, 0),
    summary,
  };
}

function familyCareShock(input: ResilienceInput): StressScenarioResult {
  const dependents = Math.min(Math.max(input.household.dependentCount, 0), 4);
  const mandatory = Math.max(input.mandatoryMonthlyExpenses, 0);
  const months = 2;
  const shock = mandatory * (0.5 + 0.35 * dependents);
  const remaining = input.liquidAssets - shock;
  const cushion = mandatory * 0.5;
  const survivable = remaining >= cushion;
  const shortfall = survivable ? 0 : Math.max(cushion - remaining, 0);
  const summary = survivable
    ? `A two-month family care shock of about ${shock.toFixed(0)} leaves a half-month operational cushion.`
    : `A two-month family care shock of about ${shock.toFixed(0)} would erode the operational buffer below a half-month cushion.`;
  return {
    id: "family-care-shock",
    label: "Family care or medical shock",
    monthsTested: months,
    survivable,
    shortfall,
    remainingLiquid: Math.max(remaining, 0),
    summary,
  };
}

function partnerIncomeLoss(input: ResilienceInput): StressScenarioResult {
  const months = 3;
  const mandatory = Math.max(input.mandatoryMonthlyExpenses, 0);
  const uncovered = mandatory * 0.5;
  const burn = uncovered * months;
  const remaining = input.liquidAssets - burn;
  const survivable = remaining >= 0;
  const shortfall = Math.max(-remaining, 0);
  const summary = survivable
    ? `If one household income stops, liquid assets cover ${months} months of the uncovered half of mandatory expenses.`
    : `Losing one of two household incomes for ${months} months would require about ${shortfall.toFixed(0)} more liquidity.`;
  return {
    id: "partner-income-loss",
    label: "Partner or second income interruption",
    monthsTested: months,
    survivable,
    shortfall,
    remainingLiquid: Math.max(remaining, 0),
    summary,
  };
}

function buildExplanations(
  household: HouseholdRiskInput,
  debt: DebtRiskInput,
  risk: RiskAssessment,
  layers: LayerTargets,
  totals: ReserveTotals,
): { explanations: Explanation[]; notes: DescriptiveNote[] } {
  const explanations: Explanation[] = [];
  if (risk.incomeStabilityPoints > 0) {
    explanations.push({
      factor: "incomeStability",
      effect:
        "Variable or seasonal income widens core and extended reserve ranges.",
      direction: "widen",
    });
  }
  if (risk.householdIncomePoints > 0) {
    explanations.push({
      factor: "singleHouseholdIncome",
      effect:
        "A single household income source increases starter and core reserve targets.",
      direction: "widen",
    });
  }
  if (risk.dependentPoints > 0) {
    explanations.push({
      factor: "dependents",
      effect: `${household.dependentCount} dependent(s) add about ${(Math.round(risk.dependentPoints * 0.25 * 10) / 10).toFixed(1)} month(s) to the recommended core reserve.`,
      direction: "widen",
    });
  }
  if (risk.debtServicePoints > 0) {
    explanations.push({
      factor: "debtServiceRatio",
      effect:
        "Higher fixed debt payments increase the operational buffer and core reserve.",
      direction: "widen",
    });
  }
  if (layers.extendedReserve.recommended <= 0) {
    explanations.push({
      factor: "extendedReserve",
      effect: "Current risk profile does not require an extended reserve layer.",
      direction: "neutral",
    });
  } else {
    explanations.push({
      factor: "extendedReserve",
      effect:
        "Elevated household risk suggests an additional extended reserve beyond the core layer.",
      direction: "widen",
    });
  }
  if (totals.currentGapToRecommended <= 0) {
    explanations.push({
      factor: "coverage",
      effect: "Liquid assets meet or exceed the recommended all-layer target.",
      direction: "neutral",
    });
  }
  const notes: DescriptiveNote[] = [
    {
      topic: "disclaimer",
      text: "These figures describe liquidity ranges and scenario math. They are not personalized investment or credit advice.",
    },
    {
      topic: "experiencesFund",
      text: "The experiences fund is planned separately from emergency reserves so quality-of-life goals do not compete with shock coverage.",
    },
  ];
  if (
    debt.highInterestBalance > 0 &&
    layers.starterEmergencyFund.recommended > debt.highInterestBalance * 0.1
  ) {
    notes.push({
      topic: "debtTradeoff",
      text: "Households with high-interest debt often compare accelerated payoff savings with the liquidity risk of a thinner starter fund; both paths have trade-offs worth modelling.",
    });
  }
  if (
    debt.monthlyPayments > 0 &&
    totals.monthsOfMandatoryExpensesCovered < 3
  ) {
    notes.push({
      topic: "debtLiquidity",
      text: "Mandatory expenses and debt payments together reduce how many disruption months current liquidity can absorb.",
    });
  }
  if (
    household.riskTolerance === "aggressive" &&
    layers.coreReserve.recommended < layers.coreReserve.max
  ) {
    notes.push({
      topic: "riskTolerance",
      text: "A higher risk tolerance narrows the recommended core reserve; stress scenarios still show downside coverage.",
    });
  }
  return { explanations, notes };
}

export function evaluateResiliencePlan(input: ResilienceInput): ResiliencePlan {
  const { layers, totals, coverage, risk } = computeLayers(input);
  const stress = runStressScenarios(input);
  const { explanations, notes } = buildExplanations(
    input.household,
    input.debt,
    risk,
    layers,
    totals,
  );
  return {
    layers,
    totals,
    coverage,
    risk,
    stress,
    explanations,
    notes,
  };
}
