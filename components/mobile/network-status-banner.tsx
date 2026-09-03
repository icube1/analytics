"use client";

import { useEffect, useState } from "react";
import {
  getNativeBridge,
  type NetworkStatusSnapshot,
} from "@/lib/mobile/native-bridge";
import { isCapacitorNative } from "@/lib/mobile/runtime";
import {
  replayPendingOfflineSync,
  scheduleCloudPortfolioSync,
} from "@/lib/session-sync/sync-orchestrator";

function readNavigatorStatus(): NetworkStatusSnapshot {
  if (typeof navigator === "undefined") {
    return { connected: true };
  }
  return { connected: navigator.onLine };
}

export function NetworkStatusBanner() {
  const [status, setStatus] = useState<NetworkStatusSnapshot>(() =>
    readNavigatorStatus(),
  );

  useEffect(() => {
    const bridge = getNativeBridge();
    let disposeNative: (() => void) | undefined;

    const apply = (next: NetworkStatusSnapshot) => {
      setStatus((previous) => {
        if (!previous.connected && next.connected) {
          void replayPendingOfflineSync();
          scheduleCloudPortfolioSync();
        }
        return next;
      });
    };

    const onBrowserStatus = () => {
      apply(readNavigatorStatus());
    };

    window.addEventListener("online", onBrowserStatus);
    window.addEventListener("offline", onBrowserStatus);

    if (bridge) {
      void bridge.getNetworkStatus().then(apply);
      disposeNative = bridge.addNetworkListener(apply);
    }

    return () => {
      window.removeEventListener("online", onBrowserStatus);
      window.removeEventListener("offline", onBrowserStatus);
      disposeNative?.();
    };
  }, []);

  if (status.connected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100"
      data-testid="network-offline-banner"
    >
      {isCapacitorNative()
        ? "Нет сети. Локальные данные и расчёты в приложении доступны офлайн; синхронизация с API возобновится при подключении."
        : "Нет сети. Локальные данные доступны офлайн; запросы к API возобновятся при подключении."}
    </div>
  );
}
