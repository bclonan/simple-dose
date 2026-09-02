export interface CacheEntry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

export interface ClearDoseCache {
  get<T>(key: string): Promise<T | undefined>;
  getStale?<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCache implements ClearDoseCache {
  private values = new Map<string, CacheEntry<unknown>>();
  constructor(private readonly defaultTtlMs = 24 * 60 * 60 * 1000) {}

  async get<T>(key: string): Promise<T | undefined> {
    const item = this.values.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) {
      return undefined;
    }
    return item.value as T;
  }

  async getStale<T>(key: string): Promise<T | undefined> {
    return this.values.get(key)?.value as T | undefined;
  }

  async set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): Promise<void> {
    const storedAt = Date.now();
    this.values.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
  }

  async delete(key: string): Promise<void> { this.values.delete(key); }
  async clear(): Promise<void> { this.values.clear(); }
}

/** A denied or full IndexedDB must not make public medication data unavailable. */
export class ResilientCache implements ClearDoseCache {
  readonly memory: MemoryCache;
  degraded = false;
  constructor(private readonly primary: ClearDoseCache, ttlMs: number) {
    this.memory = new MemoryCache(ttlMs);
  }
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.primary.get<T>(key);
      if (value !== undefined) {
        const expiry = typeof value === 'object' && value !== null && 'expiresAt' in value ? Date.parse(String(value.expiresAt)) : NaN;
        await this.memory.set(key, value, Number.isFinite(expiry) ? Math.max(0, expiry - Date.now()) : undefined);
        return value;
      }
    } catch { this.degraded = true; }
    return this.memory.get<T>(key);
  }
  async getStale<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.primary.getStale?.<T>(key);
      if (value !== undefined) return value;
    } catch { this.degraded = true; }
    return this.memory.getStale<T>(key);
  }
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.memory.set(key, value, ttlMs);
    try { await this.primary.set(key, value, ttlMs); } catch { this.degraded = true; }
  }
  async delete(key: string): Promise<void> {
    await this.memory.delete(key);
    try { await this.primary.delete(key); } catch { this.degraded = true; }
  }
  async clear(): Promise<void> {
    await this.memory.clear();
    try { await this.primary.clear(); } catch { this.degraded = true; }
  }
}

export class DisabledCache implements ClearDoseCache {
  async get<T>(_key: string): Promise<T | undefined> { return undefined; }
  async set<T>(_key: string, _value: T, _ttlMs?: number): Promise<void> {}
  async delete(_key: string): Promise<void> {}
  async clear(): Promise<void> {}
}
