import { Outlet } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AppNav } from "./app-nav";

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col antialiased">
      <ThemeProvider>
        <AppNav />
        <Outlet />
      </ThemeProvider>
    </div>
  );
}
