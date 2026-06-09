import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv";
import { mergeTransactions } from "./merge";
import { serializeTransaction } from "./serialize";

function getStatementsDirs(): string[] {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "statements"),
    path.join(cwd, "..", "statements"),
    path.join(cwd, "public", "statements"),
  ];

  return [...new Set(candidates)].filter((dir) => fs.existsSync(dir));
}

export function loadStatementsFromDisk() {
  const dirs = getStatementsDirs();
  const batches: { sourceFile: string; transactions: ReturnType<typeof parseCsv> }[] =
    [];
  const seenFileNames = new Set<string>();

  for (const dir of dirs) {
    const entries = fs
      .readdirSync(dir)
      .filter((name) => /\.csv$/i.test(name))
      .sort((a, b) => a.localeCompare(b, "ru"));

    for (const fileName of entries) {
      const normalizedName = fileName.toLowerCase();
      if (seenFileNames.has(normalizedName)) continue;
      seenFileNames.add(normalizedName);

      const fullPath = path.join(dir, fileName);

      const text = fs.readFileSync(fullPath, "utf-8");
      const relativeDir = path.relative(process.cwd(), dir) || "statements";
      const sourceFile = `${relativeDir}/${fileName}`;
      batches.push({
        sourceFile,
        transactions: parseCsv(text, sourceFile),
      });
    }
  }

  const rawCount = batches.reduce((sum, b) => sum + b.transactions.length, 0);
  const { transactions, duplicatesRemoved, sourceFiles } =
    mergeTransactions(batches);

  return {
    transactions: transactions.map(serializeTransaction),
    meta: {
      files: sourceFiles,
      directories: dirs.map((d) => path.relative(process.cwd(), d) || d),
      totalRaw: rawCount,
      totalUnique: transactions.length,
      duplicatesRemoved,
    },
  };
}
