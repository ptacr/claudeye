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

export interface CacheEntry<T> {
  value: T;
  meta: CacheMeta;
}
