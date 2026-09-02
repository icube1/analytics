export interface MobileEnvDefaults {
  apiBase: string;
  authScheme: string;
  authCallbackPath: string;
  extraDeepLinkHosts: string[];
  appId: string;
  appName: string;
}

export function loadMobileEnvDefaults(
  env: NodeJS.ProcessEnv = process.env,
): MobileEnvDefaults {
  return {
    apiBase: env.MOBILE_API_BASE?.trim() ?? "",
    authScheme: env.MOBILE_AUTH_SCHEME?.trim() || "analytics",
    authCallbackPath: env.MOBILE_AUTH_CALLBACK_PATH?.trim() || "/auth/callback",
    extraDeepLinkHosts: (env.MOBILE_DEEP_LINK_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    appId: env.CAPACITOR_APP_ID?.trim() || "ru.galasoft.analytics",
    appName: env.CAPACITOR_APP_NAME?.trim() || "Analytics",
  };
}
