import { Outlet } from "react-router-dom";
import { NetworkStatusBanner } from "@/components/mobile/network-status-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { MobileDeepLinkListener } from "../mobile/deep-link-listener";
import { AppNav } from "./app-nav";

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col antialiased">
      <ThemeProvider>
        <MobileDeepLinkListener />
        <NetworkStatusBanner />
        <AppNav />
        <Outlet />
      </ThemeProvider>
    </div>
  );
}
