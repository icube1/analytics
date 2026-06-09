import { formatDate } from "./csv";
import type { Transaction } from "./types";

export function computeFingerprint(
  tx: Omit<Transaction, "id" | "fingerprint" | "sourceFile">,
): string {
  const txDate = tx.transactionDate ? formatDate(tx.transactionDate) : "";
  return [
    formatDate(tx.operationDate),
    txDate,
    tx.accountNumber,
    tx.cardNumber,
    tx.merchant,
    tx.amount.toFixed(2),
    tx.currency,
    tx.status,
    tx.category,
    tx.mcc,
    tx.type,
    tx.comment,
    tx.bonusValue,
  ].join("|");
}
