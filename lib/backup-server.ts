import fs from "node:fs";
import path from "node:path";
import type { AnalyticsBackup } from "./backup-types";
import { writePortfolioDocument } from "./persist-server";
import { ensureDataDir, getDataDir } from "./project-paths";
import { replaceAllStatementsOnDisk } from "./statements-server";

const MAX_SERVER_BACKUPS = 30;

function getBackupDir(): string {
  return path.join(getDataDir(), "backups");
}

function pruneOldBackups(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("analytics-") && name.endsWith(".json"))
    .map((name) => ({
      name,
      fullPath: path.join(dir, name),
      mtime: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(MAX_SERVER_BACKUPS)) {
    fs.unlinkSync(file.fullPath);
  }
}

export function saveServerBackup(backup: AnalyticsBackup): string {
  ensureDataDir();
  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const safeStamp = backup.exportedAt.replace(/[:.]/g, "-");
  const fileName = `analytics-${safeStamp}.json`;
  const filePath = path.join(backupDir, fileName);

  fs.writeFileSync(filePath, `${JSON.stringify(backup, null, 2)}\n`, "utf-8");
  writePortfolioDocument(backup.portfolio);
  replaceAllStatementsOnDisk(backup.statements);
  pruneOldBackups(backupDir);

  return filePath;
}
