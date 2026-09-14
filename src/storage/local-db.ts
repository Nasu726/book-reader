/**
 * The browser's own database, in five stores.
 *
 * IndexedDB straight, in one small module: the app needs get, put, delete and
 * list on a handful of stores, which is fewer lines than learning a wrapper.
 * The document's bytes live apart from its metadata so the library can list
 * fifty books without lifting fifty files into memory.
 */

export type StoreName = "documents" | "files" | "notes" | "progress" | "outbox";

const DB_NAME = "book-reader";
const DB_VERSION = 1;
const STORES: readonly StoreName[] = ["documents", "files", "notes", "progress", "outbox"];

let opening: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed."));
  });
}

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema: let go, and reopen on the next call.
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    req.onerror = () => { opening = null; reject(req.error ?? new Error("IndexedDB could not be opened.")); };
  });
  return opening;
}

async function inStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return request(run(db.transaction(name, mode).objectStore(name)));
}

export const localDb = {
  get<T extends { id: string }>(store: StoreName, id: string): Promise<T | undefined> {
    return inStore<T | undefined>(store, "readonly", (s) => s.get(id) as IDBRequest<T | undefined>);
  },
  put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    return inStore(store, "readwrite", (s) => s.put(value)).then(() => undefined);
  },
  delete(store: StoreName, id: string): Promise<void> {
    return inStore(store, "readwrite", (s) => s.delete(id)).then(() => undefined);
  },
  list<T extends { id: string }>(store: StoreName): Promise<T[]> {
    return inStore<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
  },
};
