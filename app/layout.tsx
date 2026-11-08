import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import { AppFooter } from "@/components/app-footer";
import { TestEnvBanner } from "@/components/test-env-banner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/**
 * Шрифты держим локальным стеком, а не next/font/google: сборка не должна
 * зависеть от доступности fonts.googleapis.com (офлайн/корпоративный прокси).
 * Имена переменных те же, что использовал Geist, чтобы стили не поехали.
 */
const fontVariables = {
  "--font-geist-sans":
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  "--font-geist-mono":
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as React.CSSProperties;

export const metadata: Metadata = {
  title: "Финансовая аналитика",
  description: "Анализ банковской выписки и инвестиционного портфеля",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className="h-full antialiased"
      style={fontVariables}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TestEnvBanner />
          <AppNav />
          <div className="flex flex-1 flex-col">{children}</div>
          <AppFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
