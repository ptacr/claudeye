/**
 * Pluggable storage backend for eval/enrichment result caching.
 * Currently only LocalCacheBackend (JSON files on disk) is implemented,
 * but the interface allows for future backends (e.g. Redis, SQLite).
 */
export interface CacheBackend {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, meta: CacheMeta): Promise<void>;
  invalidate(key: string): Promise<void>;
  invalidateByPrefix(prefix: string): Promise<void>;
  close(): Promise<void>;
}

export interface CacheMeta {
  cachedAt: string;
  contentHash: string; // session file mtime+size hash
  evalsModuleHash: string; // evals file content hash
  registeredNames: string[]; // eval/enricher names at cache time
}

/** A cached value together with the metadata used for invalidation checks. */
export interface CacheEntry<T> {
  value: T;
  meta: CacheMeta;
}

/** Metadata for a per-item cache entry (one eval/enricher result). */
export interface ItemCacheMeta {
  cachedAt: string;
  contentHash: string;    // session file mtime+size hash (same as CacheMeta)
  itemCodeHash: string;   // SHA-256 of fn.toString() — detects function code changes
}

/** A single item's cached result with per-item metadata. */
export interface ItemCacheEntry<T> {
  value: T;
  meta: ItemCacheMeta;
}
