export type AppBuildInfo = {
  version: string;
  sha: string;
  builtAt: string;
};

const DEFAULT_VERSION = "0.1.0";

export function readAppBuildInfo(
  env: NodeJS.ProcessEnv = process.env,
): AppBuildInfo {
  const sha = (env.APP_GIT_SHA || env.GITHUB_SHA || "").trim();
  return {
    version: (env.APP_VERSION || DEFAULT_VERSION).trim() || DEFAULT_VERSION,
    sha,
    builtAt: (env.APP_BUILT_AT || "").trim(),
  };
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function formatBuiltAt(iso: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export function formatAppReleaseLabel(info: AppBuildInfo): string {
  const sha = shortSha(info.sha);
  const version = sha
    ? `Версия ${info.version} (${sha})`
    : `Версия ${info.version}`;
  const updated = formatBuiltAt(info.builtAt);
  return updated ? `${version} · обновлено ${updated}` : version;
}
