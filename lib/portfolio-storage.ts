import { normalizeCustomAssets } from "./custom-assets";
import {
  DEFAULT_DOCUMENT,
  type PortfolioDocument,
} from "./portfolio-types";

const LEGACY_STORAGE_KEY = "analytics-portfolio-v1";

export async function fetchPortfolioDocument(): Promise<PortfolioDocument> {
  const res = await fetch("/api/portfolio");
  if (!res.ok) {
    throw new Error("Не удалось загрузить сохранённые данные");
  }
  const data = (await res.json()) as PortfolioDocument;
  return {
    ...DEFAULT_DOCUMENT,
    ...data,
    customAssets: normalizeCustomAssets(data.customAssets),
    compoundParams: {
      ...DEFAULT_DOCUMENT.compoundParams,
      ...data.compoundParams,
    },
  };
}

export async function savePortfolioDocument(
  patch: Partial<PortfolioDocument>,
): Promise<PortfolioDocument> {
  const res = await fetch("/api/portfolio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Не удалось сохранить данные",
    );
  }

  return (await res.json()) as PortfolioDocument;
}

export async function uploadBrokerReport(
  file: File,
): Promise<{ report: PortfolioDocument["brokerReport"]; fileName: string }> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/portfolio/broker", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Не удалось сохранить отчёт",
    );
  }

  return (await res.json()) as {
    report: PortfolioDocument["brokerReport"];
    fileName: string;
  };
}

export function readLegacyLocalStorage(): Partial<PortfolioDocument> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PortfolioDocument>;
  } catch {
    return null;
  }
}

export function clearLegacyLocalStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
