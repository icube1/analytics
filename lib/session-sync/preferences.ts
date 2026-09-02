export const CLOUD_SYNC_PREF_KEY = "analytics.cloud-sync.enabled.v1";

export const CLOUD_SYNC_PRIVACY_COPY = [
  "Облачная синхронизация отправляет зашифрованный портфель на сервер finance-api.",
  "Пароли не сохраняются на устройстве — только сессия (cookie в браузере или bearer в sessionStorage приложения).",
  "Вы можете отключить синхронизацию в любой момент; локальные данные останутся на устройстве.",
  "До включения эксперимента используется прежний путь бэкапа через Next.js (/api/backup).",
].join(" ");

export function isCloudSyncEnabledByUser(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(CLOUD_SYNC_PREF_KEY) === "1";
}

export function setCloudSyncEnabledByUser(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (enabled) localStorage.setItem(CLOUD_SYNC_PREF_KEY, "1");
  else localStorage.removeItem(CLOUD_SYNC_PREF_KEY);
}
