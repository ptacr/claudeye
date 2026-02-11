/**
 * Simple in-memory cache with TTL, used instead of Next.js `unstable_cache`
 * to avoid the Data Cache persisting stale build-time results to disk.
 */
export function runtimeCache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  revalidateSeconds: number
): (...args: TArgs) => Promise<TResult> {
  const cache = new Map<string, { data: TResult; expiry: number }>();

  return async (...args: TArgs): Promise<TResult> => {
    const key = JSON.stringify(args);
    const entry = cache.get(key);
    if (entry && Date.now() < entry.expiry) {
      return entry.data;
    }
    const data = await fn(...args);
    cache.set(key, { data, expiry: Date.now() + revalidateSeconds * 1000 });
    return data;
  };
}
