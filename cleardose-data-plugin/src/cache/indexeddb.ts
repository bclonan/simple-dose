import type { CacheEntry, ClearDoseCache } from './cache';

export class IndexedDbCache implements ClearDoseCache {
  private dbPromise?: Promise<IDBDatabase>;

  constructor(
    private readonly databaseName = 'cleardose-data-cache',
    private readonly defaultTtlMs = 24 * 60 * 60 * 1000,
    private readonly openTimeoutMs = 2500
  ) {}

  private db(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.databaseName, 1);
      let settled = false;
      const fail = (error: unknown) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => fail(new Error('IndexedDB open timed out.')), this.openTimeoutMs);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries');
      };
      req.onsuccess = () => {
        if (settled) { req.result.close(); return; }
        settled = true; clearTimeout(timer); resolve(req.result);
      };
      req.onerror = () => fail(req.error);
      req.onblocked = () => fail(new Error('IndexedDB is blocked by another tab.'));
    });
    return this.dbPromise;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const item = await this.read<T>(key);
    return item && item.expiresAt > Date.now() ? item.value : undefined;
  }

  async getStale<T>(key: string): Promise<T | undefined> {
    return (await this.read<T>(key))?.value;
  }

  private async read<T>(key: string): Promise<CacheEntry<T> | undefined> {
    if (typeof indexedDB === 'undefined') return undefined;
    const db = await this.db();
    const item = await new Promise<CacheEntry<T> | undefined>((resolve, reject) => {
      const tx = db.transaction('entries', 'readonly');
      const req = tx.objectStore('entries').get(key);
      req.onsuccess = () => resolve(req.result as CacheEntry<T> | undefined);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read aborted.'));
    });
    return item;
  }

  async set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const db = await this.db();
    const storedAt = Date.now();
    const item: CacheEntry<T> = { value, storedAt, expiresAt: storedAt + ttlMs };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(item, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted.'));
    });
  }

  async delete(key: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted.'));
    });
  }

  async clear(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB clear aborted.'));
    });
  }
}
