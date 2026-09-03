import { importBrokerReport } from "./import";
import type { BrokerImportResult } from "./types";

/** Text formats the production adapters can parse. Binary Excel is not supported. */
export const BROKER_TEXT_UPLOAD_EXTENSIONS = [
  ".html",
  ".htm",
  ".csv",
  ".tsv",
  ".txt",
  ".xml",
] as const;

export const BROKER_TEXT_UPLOAD_ACCEPT = BROKER_TEXT_UPLOAD_EXTENSIONS.join(",");

const BINARY_EXCEL_EXTENSIONS = new Set([".xls", ".xlsx"]);

export function describeBrokerUploadError(
  result: BrokerImportResult,
  fileName = "",
): string {
  const extension = fileName.toLowerCase().match(/(\.[^.]+)$/)?.[1] ?? "";
  if (BINARY_EXCEL_EXTENSIONS.has(extension)) {
    return "Двоичный Excel пока не читается. Сохраните отчёт как CSV, TSV или XML.";
  }

  const code = result.errors[0]?.code;
  if (code === "NO_ADAPTER_MATCH") {
    return "Не удалось определить формат отчёта. Поддерживаются HTML Сбера, CSV/TSV и XML.";
  }
  if (code === "FILE_TOO_LARGE" || code === "ROW_LIMIT_EXCEEDED") {
    return result.errors[0]?.message ?? "Файл слишком большой для импорта";
  }
  if (code === "CONTENT_EMPTY") {
    return "Файл пустой";
  }

  return (
    result.errors[0]?.message ?? "Не удалось распознать данные в отчёте"
  );
}

export function importUploadedBrokerFile(
  content: string,
  fileName: string,
  mimeType?: string,
): BrokerImportResult {
  return importBrokerReport({
    content,
    fileName,
    mimeType,
  });
}
