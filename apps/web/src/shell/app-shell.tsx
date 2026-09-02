import { Outlet } from "react-router-dom";
import { NetworkStatusBanner } from "@/components/mobile/network-status-banner";
import { CloudSyncPanel } from "@/components/session-sync/cloud-sync-panel";
import { SessionSyncProvider } from "@/components/session-sync/session-sync-provider";
import { SyncConflictPanel } from "@/components/session-sync/sync-conflict-panel";
import { ThemeProvider } from "@/components/theme-provider";
import { MobileDeepLinkListener } from "../mobile/deep-link-listener";
import { AppNav } from "./app-nav";

export function AppShell() {
  return (
    <SessionSyncProvider>
      <div className="flex min-h-full flex-col antialiased">
        <ThemeProvider>
          <MobileDeepLinkListener />
          <NetworkStatusBanner />
          <SyncConflictPanel />
          <AppNav />
          <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
            <CloudSyncPanel />
          </div>
          <Outlet />
        </ThemeProvider>
      </div>
    </SessionSyncProvider>
  );
}
