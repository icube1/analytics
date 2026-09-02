import { loadMobileEnvDefaults } from "./env-defaults";

export function readCapacitorEnv() {
  return loadMobileEnvDefaults();
}

export function buildMobileRuntimePayload(env = readCapacitorEnv()) {
  return {
    apiBase: env.apiBase,
    authCallbackScheme: env.authScheme || "analytics",
    authCallbackPath: env.authCallbackPath || "/auth/callback",
    deepLinkHosts: ["app.gala-soft.ru", ...(env.extraDeepLinkHosts ?? [])],
  };
}
