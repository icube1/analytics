import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./shell/app-shell";
import { HomePage } from "./pages/home-page";
import { InvestmentsPage } from "./pages/investments-page";
import { ResiliencePage } from "./pages/resilience-page";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="resilience" element={<ResiliencePage />} />
        <Route path="investments" element={<InvestmentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return <AppRoutes />;
}
