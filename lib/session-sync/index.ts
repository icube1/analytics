export { isWebSessionSyncFeatureEnabled, parseFeatureFlag } from "./feature-flags";
export {
  CLOUD_SYNC_PREF_KEY,
  CLOUD_SYNC_PRIVACY_COPY,
  isCloudSyncEnabledByUser,
  setCloudSyncEnabledByUser,
} from "./preferences";
export {
  loginWithPassword,
  logoutSession,
  fetchMe,
  refreshAuthState,
  readCachedMe,
  clearAuthSessionCache,
  type AuthSessionState,
} from "./auth-client";
export {
  authenticatedFetch,
  sessionApiUrl,
  SESSION_API_PREFIX,
} from "./transport";
export {
  pullPortfolio,
  pushPortfolio,
  readLocalRevision,
  writeLocalRevision,
  clearLocalRevision,
  type PortfolioSyncOutcome,
  type PortfolioConflictResult,
} from "./portfolio-sync";
export {
  enqueueOfflineSync,
  listOfflineQueue,
  replayOfflineQueue,
  clearOfflineQueue,
  type OfflineSyncQueueItem,
} from "./offline-queue";
export {
  scheduleCloudPortfolioSync,
  runCloudPortfolioSync,
  replayPendingOfflineSync,
  pullRemotePortfolioIntoLocal,
  buildSyncOrchestratorState,
  readLastSyncConflict,
  clearLastSyncConflict,
  type SyncOrchestratorState,
} from "./sync-orchestrator";
export {
  schedulePortfolioPersistence,
  resolvePersistenceBackend,
  isNextBackupDefaultPath,
  type PersistenceBackend,
} from "./backup-adapter";
export {
  redactSecrets,
  assertNoSecretsInJson,
  safeSerializeForPersistence,
} from "./secrets";
export {
  CSRF_HEADER,
  SessionApiError,
  type LoginResponse,
  type MeResponse,
  type PortfolioSyncRequest,
  type PortfolioSyncResponse,
} from "./contracts";
export { resolveSessionClientKind } from "./client-kind";
export {
  getTokenStorage,
  clearAllSessionTokens,
  resetTokenStorageForTests,
} from "./token-storage";
