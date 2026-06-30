import type { CustomAssets } from "../portfolio-types";
import type { WealthSimulationState } from "../debt-amortization";
import { LIQUID_ASSET_ID, LIQUID_ASSET_LABEL } from "./constants";
import type { AssetBreakdownEntry } from "./types";

export function buildAssetBreakdown(
  state: WealthSimulationState,
  assets: CustomAssets,
): AssetBreakdownEntry[] {
  const itemById = new Map(assets.items.map((item) => [item.id, item]));
  const breakdown: AssetBreakdownEntry[] = [
    {
      id: LIQUID_ASSET_ID,
      label: LIQUID_ASSET_LABEL,
      netEquity: state.investmentBalance,
    },
  ];

  for (const sim of state.assetItems) {
    const item = itemById.get(sim.id);
    breakdown.push({
      id: sim.id,
      label: item?.label ?? sim.id,
      netEquity: sim.grossValue - sim.debtBalance,
    });
  }

  return breakdown;
}
