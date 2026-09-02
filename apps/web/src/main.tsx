import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { shouldUseHashRouter } from "@/lib/mobile/runtime";
import { App } from "./App";
import { initCapacitorShell } from "./mobile/init-capacitor";
import "./styles/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

const mountTarget = rootElement;
const Router = shouldUseHashRouter() ? HashRouter : BrowserRouter;

async function bootstrap() {
  await initCapacitorShell();

  createRoot(mountTarget).render(
    <StrictMode>
      <Router>
        <App />
      </Router>
    </StrictMode>,
  );
}

void bootstrap();
