import {
  deleteStatementFromDb,
  listStatementsFromDb,
  saveStatementToDb,
} from "./browser-idb";
import {
  loadStatementsFromRecords,
  sanitizeStatementFileName,
} from "./statements-core";

export type StatementsPayload = ReturnType<
  typeof loadStatementsFromRecords
> & {
  savedFiles?: string[];
};

async function loadFromBrowser() {
  const records = await listStatementsFromDb();
  return loadStatementsFromRecords(records);
}

export async function fetchStatements(): Promise<StatementsPayload> {
  return loadFromBrowser();
}

export async function uploadStatementFiles(files: FileList | File[]) {
  const savedFiles: string[] = [];

  for (const file of [...files]) {
    const content = await file.text();
    const fileName = sanitizeStatementFileName(file.name);
    await saveStatementToDb({ fileName, content });
    savedFiles.push(fileName);
  }

  const payload = await loadFromBrowser();
  return { ...payload, savedFiles };
}

export async function deleteStatementFile(fileName: string) {
  const safeName = sanitizeStatementFileName(fileName);
  await deleteStatementFromDb(safeName);
  return loadFromBrowser();
}
