import { LocalCacheBackend } from "./local-backend";
import { hashSessionFile, hashEvalsModule } from "./hash";
import type { CacheBackend, CacheEntry } from "./types";

const BACKEND_KEY = "__CLAUDEYE_CACHE_BACKEND__";
const DISABLED_KEY = "__CLAUDEYE_CACHE_DISABLED__";

interface GlobalWithCache {
  [BACKEND_KEY]?: CacheBackend;
  [DISABLED_KEY]?: boolean;
}

/**
 * Initialize the cache backend (idempotent).
 * Reads CLAUDEYE_CACHE and CLAUDEYE_CACHE_PATH env vars.
 * Stores backend in globalThis to survive Next.js hot reloading.
 */
export function initCacheBackend(): CacheBackend | null {
  const g = globalThis as GlobalWithCache;

  if (g[DISABLED_KEY]) return null;

  if (g[BACKEND_KEY]) return g[BACKEND_KEY];

  const cacheEnv = process.env.CLAUDEYE_CACHE;
  if (cacheEnv === "off") {
    g[DISABLED_KEY] = true;
    return null;
  }

  const cachePath = process.env.CLAUDEYE_CACHE_PATH || undefined;
  const backend = new LocalCacheBackend(cachePath);
  g[BACKEND_KEY] = backend;
  return backend;
}

function cacheKey(kind: "evals" | "enrichments", projectName: string, sessionKey: string): string {
  return `${kind}/${projectName}/${sessionKey}`;
}

/**
 * Look up cached result. Returns null on any mismatch or cache miss.
 * `sessionKey` can be a plain session ID or a composite key like `sessionId/agent-xxx`.
 * When `overrideContentHash` is provided, it is used instead of computing via `hashSessionFile()`.
 */
export async function getCachedResult<T>(
  kind: "evals" | "enrichments",
  projectName: string,
  sessionKey: string,
  registeredNames: string[],
  overrideContentHash?: string,
): Promise<(CacheEntry<T> & { cached: true }) | null> {
  const backend = initCacheBackend();
  if (!backend) return null;

  try {
    const entry = await backend.get<T>(cacheKey(kind, projectName, sessionKey));
    if (!entry) return null;

    // Validate content hash (session/subagent file changed?)
    const currentContentHash = overrideContentHash ?? await hashSessionFile(projectName, sessionKey);
    if (entry.meta.contentHash !== currentContentHash) return null;

    // Validate evals module hash (evals file changed?)
    const currentEvalsHash = await hashEvalsModule();
    if (entry.meta.evalsModuleHash !== currentEvalsHash) return null;

    // Validate registered names match
    const cachedNames = [...entry.meta.registeredNames].sort();
    const currentNames = [...registeredNames].sort();
    if (
      cachedNames.length !== currentNames.length ||
      cachedNames.some((n, i) => n !== currentNames[i])
    ) {
      return null;
    }

    return { ...entry, cached: true };
  } catch {
    return null;
  }
}

/**
 * Store result in cache. Fire-and-forget — errors are swallowed.
 * `sessionKey` can be a plain session ID or a composite key like `sessionId/agent-xxx`.
 * When `overrideContentHash` is provided, it is used instead of computing via `hashSessionFile()`.
 */
export async function setCachedResult<T>(
  kind: "evals" | "enrichments",
  projectName: string,
  sessionKey: string,
  value: T,
  registeredNames: string[],
  overrideContentHash?: string,
): Promise<void> {
  const backend = initCacheBackend();
  if (!backend) return;

  try {
    const [contentHash, evalsModuleHash] = await Promise.all([
      overrideContentHash ? Promise.resolve(overrideContentHash) : hashSessionFile(projectName, sessionKey),
      hashEvalsModule(),
    ]);

    await backend.set(cacheKey(kind, projectName, sessionKey), value, {
      cachedAt: new Date().toISOString(),
      contentHash,
      evalsModuleHash,
      registeredNames,
    });
  } catch {
    // Cache write failures should never break eval execution
  }
}

/**
 * Close the cache backend for clean shutdown.
 */
export async function closeCacheBackend(): Promise<void> {
  const g = globalThis as GlobalWithCache;
  const backend = g[BACKEND_KEY];
  if (backend) {
    await backend.close();
    delete g[BACKEND_KEY];
  }
}
