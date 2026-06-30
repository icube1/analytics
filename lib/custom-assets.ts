import { ASSUMED_RETURNS } from "./portfolio-assumptions";
import type {
  ApartmentAsset,
  CustomAssetItem,
  CustomAssets,
  DebtObligation,
  GoldAsset,
  ReitAsset,
} from "./portfolio-types";

export type AssetReturnMode = CustomAssetItem["returnMode"];
export type AssetIncomePeriod = CustomAssetItem["incomePeriod"];

interface LegacyCustomAssets {
  items?: CustomAssetItem[];
  apartment?: ApartmentAsset;
  reit?: ReitAsset;
  gold?: GoldAsset;
  otherDebts?: DebtObligation[];
}

export function createCustomAsset(
  partial: Partial<CustomAssetItem> = {},
): CustomAssetItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    enabled: partial.enabled ?? true,
    label: partial.label ?? "Новый актив",
    value: partial.value ?? 0,
    debt: partial.debt ?? 0,
    monthlyDebtPayment: partial.monthlyDebtPayment ?? 0,
    debtAnnualRate: partial.debtAnnualRate ?? 0,
    growsWithInflation: partial.growsWithInflation ?? false,
    returnMode: partial.returnMode ?? "none",
    annualReturnPercent: partial.annualReturnPercent ?? 0,
    incomeAmount: partial.incomeAmount ?? 0,
    incomePeriod: partial.incomePeriod ?? "monthly",
    generatesDividendTax: partial.generatesDividendTax ?? false,
    notes: partial.notes ?? "",
  };
}

function migrateLegacyItem(
  id: string,
  label: string,
  enabled: boolean,
  value: number,
  extra: Partial<CustomAssetItem>,
): CustomAssetItem {
  return createCustomAsset({
    id,
    enabled,
    label,
    value,
    ...extra,
  });
}

function migrateFromLegacy(raw: LegacyCustomAssets): CustomAssetItem[] {
  const items: CustomAssetItem[] = [];

  if (raw.apartment) {
    const apt = raw.apartment;
    items.push(
      migrateLegacyItem("legacy-apartment", apt.label || "Квартира", apt.enabled, apt.estimatedValue, {
        debt: apt.mortgageDebt,
        monthlyDebtPayment: apt.monthlyMortgagePayment,
        debtAnnualRate: apt.mortgageAnnualRate,
        growsWithInflation: true,
        returnMode: "none",
        notes: apt.notes,
      }),
    );
  }

  if (raw.reit) {
    const reit = raw.reit;
    items.push(
      migrateLegacyItem("legacy-reit", reit.label || "Паи ЗПИФ", reit.enabled, reit.units * reit.pricePerUnit, {
        returnMode: "percent",
        annualReturnPercent: ASSUMED_RETURNS.reit,
        generatesDividendTax: true,
        notes: reit.fundName
          ? [reit.fundName, reit.notes].filter(Boolean).join(" · ")
          : reit.notes,
      }),
    );
  }

  if (raw.gold) {
    const gold = raw.gold;
    items.push(
      migrateLegacyItem("legacy-gold", gold.label || "Золото", gold.enabled, gold.weightGrams * gold.pricePerGram, {
        returnMode: "percent",
        annualReturnPercent: ASSUMED_RETURNS.gold,
        notes: gold.notes,
      }),
    );
  }

  return items;
}

function normalizeItem(item: Partial<CustomAssetItem>): CustomAssetItem {
  return createCustomAsset(item);
}

export function normalizeCustomAssets(raw: LegacyCustomAssets | CustomAssets | null | undefined): CustomAssets {
  if (!raw) {
    return { items: [], otherDebts: [] };
  }

  const otherDebts = raw.otherDebts ?? [];

  if (Array.isArray(raw.items) && raw.items.length > 0) {
    return {
      items: raw.items.map((item) => normalizeItem(item)),
      otherDebts,
    };
  }

  const legacy = raw as LegacyCustomAssets;
  if (legacy.apartment || legacy.reit || legacy.gold) {
    return {
      items: migrateFromLegacy(legacy),
      otherDebts,
    };
  }

  return { items: [], otherDebts };
}

export function getEnabledItems(assets: CustomAssets): CustomAssetItem[] {
  return assets.items.filter((item) => item.enabled);
}

export function getAssetNetValue(item: CustomAssetItem): number {
  if (!item.enabled) return 0;
  return Math.max(0, item.value - item.debt);
}

export function getCustomAssetsTotal(assets: CustomAssets): number {
  return assets.items.reduce((sum, item) => sum + getAssetNetValue(item), 0);
}

export function getAssetCapitalGrowthPercent(
  item: CustomAssetItem,
  inflationPercent: number,
): number {
  if (item.growsWithInflation) return inflationPercent;
  if (item.returnMode === "percent") return item.annualReturnPercent;
  return 0;
}

export function getAssetAnnualIncome(item: CustomAssetItem): number {
  if (!item.enabled || item.returnMode !== "income" || item.incomeAmount <= 0) {
    return 0;
  }
  return item.incomePeriod === "monthly"
    ? item.incomeAmount * 12
    : item.incomeAmount;
}

export function getAssetMonthlyIncome(item: CustomAssetItem): number {
  return getAssetAnnualIncome(item) / 12;
}

/** Доходность от денежного потока (аренда и т.п.), % годовых от стоимости */
export function getAssetIncomeReturnPercent(item: CustomAssetItem): number {
  if (!item.enabled || item.value <= 0) return 0;
  return (getAssetAnnualIncome(item) / item.value) * 100;
}

/** Совокупная ожидаемая доходность: рост стоимости + денежный доход */
export function getAssetTotalReturnPercent(
  item: CustomAssetItem,
  inflationPercent: number,
): number {
  return (
    getAssetCapitalGrowthPercent(item, inflationPercent) +
    getAssetIncomeReturnPercent(item)
  );
}

export function getCustomAssetsMonthlyIncome(assets: CustomAssets): number {
  return getEnabledItems(assets).reduce(
    (sum, item) => sum + getAssetMonthlyIncome(item),
    0,
  );
}

export function hasCustomAssetData(assets: CustomAssets): boolean {
  const hasItems = assets.items.some(
    (item) =>
      item.enabled ||
      item.value > 0 ||
      item.debt > 0 ||
      item.incomeAmount > 0,
  );
  const hasDebts = (assets.otherDebts ?? []).some(
    (debt) => debt.enabled && (debt.balance > 0 || debt.monthlyPayment > 0),
  );
  return hasItems || hasDebts;
}
