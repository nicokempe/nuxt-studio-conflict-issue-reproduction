import { IDBFactory } from 'fake-indexeddb';

/** Observes connections through the public IndexedDB interface, not implementation internals. */
export function createDatabaseFixture(): {
  factory: IDBFactory;
  connections: IDBDatabase[];
  opens: () => number;
  blocked: () => number;
} {
  const factory = new IDBFactory();
  const connections: IDBDatabase[] = [];
  let opens = 0;
  let blocked = 0;
  const nativeOpen = factory.open.bind(factory);
  factory.open = (databaseName: string, version?: number): IDBOpenDBRequest => {
    opens++;
    const request = nativeOpen(databaseName, version);
    request.addEventListener('success', () => connections.push(request.result));
    request.addEventListener('blocked', () => { blocked++; });
    return request;
  };
  return { factory, connections, opens: () => opens, blocked: () => blocked };
}

/** Opens a seeded database, optionally adding stores during its real upgrade transaction. */
export function openDatabase(factory: IDBFactory, databaseName: string, version?: number, upgrade?: (database: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database upgrade blocked: ${databaseName}.`));
  });
}

/** Waits for a seed transaction to commit before another context opens the database. */
export function put(database: IDBDatabase, storeName: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

/** Reads committed data through an independent connection. */
export function get(database: IDBDatabase, storeName: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
