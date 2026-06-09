import { computeFingerprint } from "./fingerprint";
import type { Transaction } from "./types";

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [day, month, year] = trimmed.split(".");
  if (!day || !month || !year) return null;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function buildTransaction(
  fields: string[],
  sourceFile: string,
  lineIndex: number,
): Transaction | null {
  const operationDate = parseDate(fields[0]);
  if (!operationDate) return null;

  const base = {
    operationDate,
    transactionDate: parseDate(fields[1]),
    accountName: fields[2] ?? "",
    accountNumber: fields[3] ?? "",
    cardName: fields[4] ?? "",
    cardNumber: fields[5] ?? "",
    merchant: fields[6] ?? "",
    amount: Number.parseFloat(fields[7]) || 0,
    currency: fields[8] ?? "RUR",
    status: fields[9] ?? "",
    category: fields[10] ?? "",
    mcc: fields[11] ?? "",
    type: fields[12] ?? "",
    comment: fields[13] ?? "",
    bonusValue: fields[14] ?? "",
    bonusTitle: fields[15] ?? "",
    sourceFile,
  };

  const fingerprint = computeFingerprint(base);

  return {
    ...base,
    id: `${sourceFile}#${lineIndex}#${fingerprint}`,
    fingerprint,
  };
}

export function parseCsv(text: string, sourceFile = "upload"): Transaction[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const transactions: Transaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 13) continue;

    const tx = buildTransaction(fields, sourceFile, i);
    if (tx) transactions.push(tx);
  }

  return transactions.sort(
    (a, b) => b.operationDate.getTime() - a.operationDate.getTime(),
  );
}

export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

export function toInputDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

export function fromInputDate(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}
