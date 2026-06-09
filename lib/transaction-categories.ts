import type { Transaction } from "./types";

export const SELF_TRANSFER_CATEGORY = "Переводы себе";

const INTERNAL_TRANSFER = "Между своими счетами";
const SELF_TRANSFER_PATTERN = /руслан\s+рифатович/i;

export function isInternalAccountTransfer(tx: Transaction): boolean {
  return tx.merchant.includes(INTERNAL_TRANSFER);
}

export function isSelfTransferToUser(tx: Transaction): boolean {
  return SELF_TRANSFER_PATTERN.test(tx.merchant);
}

export function isSelfTransfer(tx: Transaction): boolean {
  return isInternalAccountTransfer(tx) || isSelfTransferToUser(tx);
}

export function getDisplayCategory(tx: Transaction): string {
  if (isSelfTransfer(tx)) return SELF_TRANSFER_CATEGORY;
  return tx.category || "Без категории";
}
