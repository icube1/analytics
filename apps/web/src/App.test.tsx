import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App";

vi.mock("@/components/dashboard", () => ({
  Dashboard: () => <div data-testid="dashboard-page">Dashboard</div>,
}));

vi.mock("@/components/investments/investments-dashboard", () => ({
  InvestmentsDashboard: () => (
    <div data-testid="investments-page">Investments</div>
  ),
}));

vi.mock("@/components/resilience/resilience-dashboard", () => ({
  ResilienceDashboard: () => (
    <div data-testid="resilience-page">Resilience</div>
  ),
}));

vi.mock("@/components/journey/journey-dashboard", () => ({
  JourneyDashboard: () => <div data-testid="journey-page">Journey</div>,
}));

vi.mock("@/components/data-backup-menu", () => ({
  DataBackupMenu: () => <button type="button">Бэкап</button>,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("AppRoutes", () => {
  it("renders the statements dashboard on /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Выписка" })).toBeInTheDocument();
  });

  it("renders investments on /investments", () => {
    render(
      <MemoryRouter initialEntries={["/investments"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("investments-page")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Инвестиции" }),
    ).toBeInTheDocument();
  });

  it("renders resilience on /resilience", () => {
    render(
      <MemoryRouter initialEntries={["/resilience"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("resilience-page")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Устойчивость" }),
    ).toBeInTheDocument();
  });

  it("renders journey on /journey", () => {
    render(
      <MemoryRouter initialEntries={["/journey"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("journey-page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Путь" })).toBeInTheDocument();
  });

  it("handles auth callback route and redirects home", () => {
    render(
      <MemoryRouter initialEntries={["/auth/callback?access_token=test"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });
});
