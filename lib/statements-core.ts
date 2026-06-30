import { parseCsv } from "./csv";
import { mergeTransactions } from "./merge";
import { serializeTransaction } from "./serialize";

export interface StatementFileRecord {
  fileName: string;
  content: string;
}

export function sanitizeStatementFileName(fileName: string): string {
  const base = fileName.trim().replace(/^.*[/\\]/, "");
  if (!base || base.startsWith(".")) {
    throw new Error("Недопустимое имя файла");
  }
  if (!/\.csv$/i.test(base)) {
    throw new Error("Допустимы только CSV-файлы");
  }
  return base;
}

export function loadStatementsFromRecords(files: StatementFileRecord[]) {
  const sorted = [...files].sort((a, b) =>
    a.fileName.localeCompare(b.fileName, "ru"),
  );

  const batches = sorted.map(({ fileName, content }) => {
    const sourceFile = `statements/${fileName}`;
    return {
      sourceFile,
      transactions: parseCsv(content, sourceFile),
    };
  });

  const rawCount = batches.reduce((sum, batch) => sum + batch.transactions.length, 0);
  const { transactions, duplicatesRemoved, sourceFiles } =
    mergeTransactions(batches);

  return {
    transactions: transactions.map(serializeTransaction),
    meta: {
      files: sourceFiles,
      fileNames: sorted.map((file) => file.fileName),
      directories: ["browser"],
      totalRaw: rawCount,
      totalUnique: transactions.length,
      duplicatesRemoved,
    },
  };
}
