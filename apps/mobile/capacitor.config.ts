import type { CapacitorConfig } from "@capacitor/cli";

const appId = process.env.CAPACITOR_APP_ID ?? "ru.galasoft.analytics";
const appName = process.env.CAPACITOR_APP_NAME ?? "Analytics";
const apiBase = process.env.MOBILE_API_BASE ?? "";

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: "../web/dist",
  server: {
    androidScheme: "https",
    hostname: "app.gala-soft.ru",
    allowNavigation: [
      "app.gala-soft.ru",
      "*.gala-soft.ru",
      "gala-soft.ru",
      "*.gala-soft.ru",
    ],
    cleartext: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
  },
};

if (apiBase) {
  config.android = {
    ...config.android,
    appendUserAgent: "AnalyticsMobile",
  };
}

export default config;
