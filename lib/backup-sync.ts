import {
  exportAnalyticsBackup,
  markBackupCompleted,
} from "./backup";

let backupTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleServerBackupSync(): void {
  if (typeof window === "undefined") return;
  if (backupTimer) clearTimeout(backupTimer);

  backupTimer = setTimeout(() => {
    void syncBackupToServer();
  }, 2000);
}

export async function syncBackupToServer(): Promise<boolean> {
  try {
    const backup = await exportAnalyticsBackup();
    const response = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backup),
    });

    if (!response.ok) return false;

    markBackupCompleted(backup.exportedAt);
    return true;
  } catch {
    return false;
  }
}
