import {
  isRustCompoundParityEnabled,
  shouldCheckCompoundParity,
} from "./compound-feature-flags";
import type { CustomAssets, CompoundParams, SavedForecastPlan } from "./portfolio-types";
import { buildForecastPlan, forecastPlanFromProjection } from "./forecast-plans";

export async function buildForecastPlanOffMainThread(
  name: string,
  params: CompoundParams,
  customAssets: CustomAssets,
  brokerTotal: number,
  asOf: string,
): Promise<SavedForecastPlan> {
  const savedAt = new Date(asOf).toISOString();

  if (typeof Worker === "undefined") {
    return buildForecastPlan(name, params, customAssets, brokerTotal, savedAt);
  }

  try {
    const { createFinanceWorker } = await import("./finance-worker/browser-worker");
    const {
      createCompoundWorkerRequest,
      startCompoundWorkerJob,
    } = await import("./finance-worker/client");

    const worker = createFinanceWorker();
    const request = createCompoundWorkerRequest({
      params,
      context: { customAssets, brokerTotal },
      options: {
        asOf,
        allMonths: true,
        preferWasm: isRustCompoundParityEnabled(),
        checkParity: shouldCheckCompoundParity(),
      },
    });
    const job = startCompoundWorkerJob(worker, request);
    const result = await job.promise;
    return forecastPlanFromProjection(
      name,
      params,
      customAssets,
      brokerTotal,
      result,
      savedAt,
    );
  } catch {
    return buildForecastPlan(name, params, customAssets, brokerTotal, savedAt);
  }
}
