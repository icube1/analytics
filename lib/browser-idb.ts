const DB_NAME = "analytics";
const DB_VERSION = 1;

export interface StatementRecord {
  fileName: string;
  content: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("portfolio")) {
        db.createObjectStore("portfolio");
      }
      if (!db.objectStoreNames.contains("statements")) {
        db.createObjectStore("statements", { keyPath: "fileName" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Не удалось открыть IndexedDB"));
  });
}

function withStore<T>(
  storeName: "portfolio" | "statements",
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        run(store).then(resolve).catch(reject);

        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("Ошибка транзакции IndexedDB"));
        };
      }),
  );
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Ошибка IndexedDB"));
  });
}

const PORTFOLIO_KEY = "document";

export async function readPortfolioFromDb<T>(): Promise<T | null> {
  const value = await withStore("portfolio", "readonly", (store) =>
    requestToPromise(store.get(PORTFOLIO_KEY)),
  );
  return value ?? null;
}

export async function writePortfolioToDb<T>(value: T): Promise<void> {
  await withStore("portfolio", "readwrite", (store) =>
    requestToPromise(store.put(value, PORTFOLIO_KEY)).then(() => undefined),
  );
}

export async function listStatementsFromDb(): Promise<StatementRecord[]> {
  return withStore("statements", "readonly", (store) =>
    requestToPromise(store.getAll()),
  );
}

export async function saveStatementToDb(record: StatementRecord): Promise<void> {
  await withStore("statements", "readwrite", (store) =>
    requestToPromise(store.put(record)).then(() => undefined),
  );
}

export async function deleteStatementFromDb(fileName: string): Promise<void> {
  await withStore("statements", "readwrite", (store) =>
    requestToPromise(store.delete(fileName)).then(() => undefined),
  );
}

export async function saveAllStatementsToDb(
  records: StatementRecord[],
): Promise<void> {
  await withStore("statements", "readwrite", async (store) => {
    await requestToPromise(store.clear());
    for (const record of records) {
      await requestToPromise(store.put(record));
    }
  });
}
