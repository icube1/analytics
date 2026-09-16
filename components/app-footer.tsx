import { formatAppReleaseLabel, readAppBuildInfo } from "@/lib/app-build-info";

export function AppFooter() {
  const label = formatAppReleaseLabel(readAppBuildInfo());

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white/80 px-4 py-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-400">
      <p>{label}</p>
    </footer>
  );
}
