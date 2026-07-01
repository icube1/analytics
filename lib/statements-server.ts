import fs from "node:fs";
import path from "node:path";
import { ensureStatementsDir, getStatementsDir } from "./project-paths";
import {
  loadStatementsFromRecords,
  sanitizeStatementFileName,
} from "./statements-core";

export { sanitizeStatementFileName } from "./statements-core";

export function listStatementFiles(): string[] {
  const dir = getStatementsDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((name) => /\.csv$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "ru"));
}

export function saveStatementFile(fileName: string, content: string): string {
  const safeName = sanitizeStatementFileName(fileName);
  const dir = ensureStatementsDir();
  fs.writeFileSync(path.join(dir, safeName), content, "utf-8");
  return safeName;
}

export function deleteStatementFile(fileName: string): void {
  const safeName = sanitizeStatementFileName(fileName);
  const fullPath = path.join(getStatementsDir(), safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Файл не найден: ${safeName}`);
  }
  fs.unlinkSync(fullPath);
}

export function replaceAllStatementsOnDisk(
  records: { fileName: string; content: string }[],
): void {
  const dir = ensureStatementsDir();

  for (const existing of listStatementFiles()) {
    fs.unlinkSync(path.join(dir, existing));
  }

  for (const record of records) {
    saveStatementFile(record.fileName, record.content);
  }
}

export function loadStatementsFromDisk() {
  ensureStatementsDir();

  const files = listStatementFiles().map((fileName) => ({
    fileName,
    content: fs.readFileSync(path.join(getStatementsDir(), fileName), "utf-8"),
  }));

  const result = loadStatementsFromRecords(files);
  return {
    ...result,
    meta: {
      ...result.meta,
      directories: ["statements"],
    },
  };
}
