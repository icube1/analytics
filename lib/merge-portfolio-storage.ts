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
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    customAssets: normalizeCustomAssets(partial.customAssets),
    compoundParams: normalizeCompoundParams({
      ...DEFAULT_STORAGE.compoundParams,
      ...partial.compoundParams,
    }),
    lastBrokerFileName:
      partial.lastBrokerFileName ?? DEFAULT_STORAGE.lastBrokerFileName,
    brokerReport:
      "brokerReport" in partial ? (partial.brokerReport ?? null) : null,
  };
}

export function isEmptyDocument(doc: PortfolioDocument): boolean {
  const hasCustom = hasCustomAssetData(doc.customAssets);

  const paramsChanged =
    JSON.stringify(doc.compoundParams) !==
    JSON.stringify(DEFAULT_STORAGE.compoundParams);

  return !doc.brokerReport && !hasCustom && !paramsChanged;
}
