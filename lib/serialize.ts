import type { Transaction } from "./types";

export type SerializedTransaction = Omit<
  Transaction,
  "operationDate" | "transactionDate"
> & {
  operationDate: string;
  transactionDate: string | null;
};

export function serializeTransaction(tx: Transaction): SerializedTransaction {
  return {
    ...tx,
    operationDate: tx.operationDate.toISOString(),
    transactionDate: tx.transactionDate?.toISOString() ?? null,
  };
}

export function deserializeTransaction(data: SerializedTransaction): Transaction {
  return {
    ...data,
    operationDate: new Date(data.operationDate),
    transactionDate: data.transactionDate ? new Date(data.transactionDate) : null,
  };
}
