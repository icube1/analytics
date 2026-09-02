"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearLastSyncConflict,
  fetchMe,
  isWebSessionSyncFeatureEnabled,
  logoutSession,
  readLastSyncConflict,
  refreshAuthState,
  replayPendingOfflineSync,
  type MeResponse,
  type PortfolioConflictResult,
} from "@/lib/session-sync";

interface SessionSyncContextValue {
  enabled: boolean;
  me: MeResponse | null;
  isAuthenticated: boolean;
  loading: boolean;
  conflict: PortfolioConflictResult | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  dismissConflict: () => void;
  replayOffline: () => Promise<void>;
}

const SessionSyncContext = createContext<SessionSyncContextValue | null>(null);

export function SessionSyncProvider({ children }: { children: ReactNode }) {
  const enabled = isWebSessionSyncFeatureEnabled();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [conflict, setConflict] = useState<PortfolioConflictResult | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const state = await refreshAuthState();
      setMe(state.me);
      setIsAuthenticated(state.isAuthenticated);
      setConflict(readLastSyncConflict());
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const signOut = useCallback(async () => {
    await logoutSession();
    setMe(null);
    setIsAuthenticated(false);
    setConflict(null);
  }, []);

  const dismissConflict = useCallback(() => {
    clearLastSyncConflict();
    setConflict(null);
  }, []);

  const replayOffline = useCallback(async () => {
    await replayPendingOfflineSync();
    setConflict(readLastSyncConflict());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    function handleOnline() {
      void replayOffline();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [enabled, replayOffline]);

  const value = useMemo<SessionSyncContextValue>(
    () => ({
      enabled,
      me,
      isAuthenticated,
      loading,
      conflict,
      refresh,
      signOut,
      dismissConflict,
      replayOffline,
    }),
    [
      enabled,
      me,
      isAuthenticated,
      loading,
      conflict,
      refresh,
      signOut,
      dismissConflict,
      replayOffline,
    ],
  );

  if (!enabled) return children;

  return (
    <SessionSyncContext.Provider value={value}>
      {children}
    </SessionSyncContext.Provider>
  );
}

export function useSessionSync(): SessionSyncContextValue {
  const ctx = useContext(SessionSyncContext);
  if (!ctx) {
    return {
      enabled: false,
      me: null,
      isAuthenticated: false,
      loading: false,
      conflict: null,
      refresh: async () => {},
      signOut: async () => {},
      dismissConflict: () => {},
      replayOffline: async () => {},
    };
  }
  return ctx;
}

export async function loadMeForDisplay(): Promise<MeResponse | null> {
  try {
    return await fetchMe();
  } catch {
    return null;
  }
}
