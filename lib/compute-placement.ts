/**
 * Local vs server placement for finance calculations.
 * Server jobs stay opt-in; production Next keeps the local Worker.
 */
export type ComputeKind =
  | "compound"
  | "monteCarlo"
  | "safeWithdrawal"
  | "liveTracking"
  | "resilience";

export type ComputePlacement = "local-worker" | "server-job" | "local-sync";

export interface ComputePlacementInput {
  kind: ComputeKind;
  online?: boolean;
  batterySaver?: boolean;
  /** Explicit product flag; never inferred from hostname. */
  serverJobsEnabled?: boolean;
  heavyEntitled?: boolean;
  horizonMonths?: number;
  simulations?: number;
}

const HEAVY_KINDS: ComputeKind[] = ["monteCarlo"];
const LONG_HORIZON_MONTHS = 240;
const HEAVY_SIMULATIONS = 400;

export function detectComputeEnvironment(): {
  online: boolean;
  batterySaver: boolean;
} {
  if (typeof navigator === "undefined") {
    return { online: false, batterySaver: false };
  }
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return {
    online: navigator.onLine !== false,
    batterySaver: Boolean(connection?.saveData),
  };
}

export function chooseComputePlacement(
  input: ComputePlacementInput,
): ComputePlacement {
  const online = input.online === true;
  const serverJobsEnabled = input.serverJobsEnabled === true;
  const heavyEntitled = input.heavyEntitled === true;
  const batterySaver = input.batterySaver === true;
  const horizonMonths = input.horizonMonths ?? 0;
  const simulations = input.simulations ?? 0;

  const heavy =
    HEAVY_KINDS.includes(input.kind) &&
    (simulations >= HEAVY_SIMULATIONS || horizonMonths >= LONG_HORIZON_MONTHS);

  if (
    heavy &&
    online &&
    serverJobsEnabled &&
    heavyEntitled &&
    !batterySaver
  ) {
    return "server-job";
  }

  return "local-worker";
}
