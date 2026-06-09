import type { Transaction } from "./types";

export interface MergeResult {
  transactions: Transaction[];
  duplicatesRemoved: number;
  sourceFiles: string[];
}

export function mergeTransactions(
  batches: { sourceFile: string; transactions: Transaction[] }[],
): MergeResult {
  const seen = new Set<string>();
  const merged: Transaction[] = [];
  const sourceFiles: string[] = [];
  let duplicatesRemoved = 0;

  for (const batch of batches) {
    if (batch.transactions.length > 0) {
      sourceFiles.push(batch.sourceFile);
    }

    for (const tx of batch.transactions) {
      if (seen.has(tx.fingerprint)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(tx.fingerprint);
      merged.push(tx);
    }
  }

  merged.sort((a, b) => b.operationDate.getTime() - a.operationDate.getTime());

  return {
    transactions: merged,
    duplicatesRemoved,
    sourceFiles,
  };
}

export function mergeWithExisting(
  existing: Transaction[],
  newBatches: { sourceFile: string; transactions: Transaction[] }[],
): MergeResult {
  const seen = new Set(existing.map((tx) => tx.fingerprint));
  const merged = [...existing];
  const sourceFiles = [...new Set(existing.map((tx) => tx.sourceFile))];
  let duplicatesRemoved = 0;

  for (const batch of newBatches) {
    if (batch.transactions.length > 0) {
      sourceFiles.push(batch.sourceFile);
    }

    for (const tx of batch.transactions) {
      if (seen.has(tx.fingerprint)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(tx.fingerprint);
      merged.push(tx);
    }
  }

  merged.sort((a, b) => b.operationDate.getTime() - a.operationDate.getTime());

  return {
    transactions: merged,
    duplicatesRemoved,
    sourceFiles: [...new Set(sourceFiles)],
  };
}
