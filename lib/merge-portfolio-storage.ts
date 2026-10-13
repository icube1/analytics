import { hasCustomAssetData, normalizeCustomAssets } from "./custom-assets";
import { normalizeCompoundParams } from "./normalize-compound-params";
import {
  DEFAULT_STORAGE,
  type PortfolioDocument,
  type PortfolioStorage,
} from "./portfolio-types";

export function mergePortfolioStorage(
  partial: Partial<PortfolioDocument> | Partial<PortfolioStorage>,
): PortfolioDocument {
  const base: any = {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...partial,
  };

  return {
    ...base,
    id: base.id ?? "default",
    groupId: base.groupId ?? undefined,
    customAssets: normalizeCustomAssets(base.customAssets),
    compoundParams: normalizeCompoundParams({
      ...DEFAULT_STORAGE.compoundParams,
      ...base.compoundParams,
    }),
    lastBrokerFileName:
      base.lastBrokerFileName ?? DEFAULT_STORAGE.lastBrokerFileName,
    brokerReport:
      "brokerReport" in base ? (base.brokerReport ?? null) : null,
    brokerAccounts:
      "brokerAccounts" in base ? (base.brokerAccounts ?? []) : [],
    brokerSnapshots:
      "brokerSnapshots" in base ? (base.brokerSnapshots ?? []) : [],
    debtBalanceHistory:
      "debtBalanceHistory" in base ? (base.debtBalanceHistory ?? []) : [],
    forecastPlans:
      "forecastPlans" in base ? (base.forecastPlans ?? []) : [],
  };
}

export function isEmptyDocument(doc: PortfolioDocument): boolean {
  const hasCustom = hasCustomAssetData(doc.customAssets);

  const paramsChanged =
    JSON.stringify(doc.compoundParams) !==
    JSON.stringify(DEFAULT_STORAGE.compoundParams);

  return !doc.brokerReport && !doc.brokerAccounts?.length && !hasCustom && !paramsChanged;
}
