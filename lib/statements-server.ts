import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv";
import { mergeTransactions } from "./merge";
import { ensureStatementsDir, getStatementsDir } from "./project-paths";
import { serializeTransaction } from "./serialize";

export function sanitizeStatementFileName(fileName: string): string {
  const base = path.basename(fileName.trim());
  if (!base || base.startsWith(".")) {
    throw new Error("Недопустимое имя файла");
  }
  if (!/\.csv$/i.test(base)) {
    throw new Error("Допустимы только CSV-файлы");
  }
  return base;
}

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

export function loadStatementsFromDisk() {
  const dir = getStatementsDir();
  ensureStatementsDir();

  const batches: { sourceFile: string; transactions: ReturnType<typeof parseCsv> }[] =
    [];

  for (const fileName of listStatementFiles()) {
    const fullPath = path.join(dir, fileName);
    const text = fs.readFileSync(fullPath, "utf-8");
    const sourceFile = `statements/${fileName}`;
    batches.push({
      sourceFile,
      transactions: parseCsv(text, sourceFile),
    });
  }

  const rawCount = batches.reduce((sum, b) => sum + b.transactions.length, 0);
  const { transactions, duplicatesRemoved, sourceFiles } =
    mergeTransactions(batches);

  return {
    transactions: transactions.map(serializeTransaction),
    meta: {
      files: sourceFiles,
      fileNames: listStatementFiles(),
      directories: ["statements"],
      totalRaw: rawCount,
      totalUnique: transactions.length,
      duplicatesRemoved,
    },
  };
}
