import { readFile, writeFile, unlink, readdir, rm, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";
import { batchAll } from "@/lib/concurrency";
import type { CacheBackend, CacheEntry, CacheMeta } from "./types";

const DEFAULT_CACHE_PATH = join(homedir(), ".claudeye", "cache");

export class LocalCacheBackend implements CacheBackend {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || DEFAULT_CACHE_PATH;
  }

  private keyToPath(key: string): string {
    return join(this.basePath, `${key}.json`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const filePath = this.keyToPath(key);
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, meta: CacheMeta): Promise<void> {
    try {
      const filePath = this.keyToPath(key);
      await mkdir(dirname(filePath), { recursive: true });
      const entry: CacheEntry<T> = { value, meta };
      await writeFile(filePath, JSON.stringify(entry), "utf-8");
    } catch {
      // Cache write failures should never break eval execution
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await unlink(this.keyToPath(key));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async invalidateByPrefix(prefix: string): Promise<void> {
    try {
      // Split prefix into directory part and filename prefix.
      // "evals/project-a/" → dir segments = ["evals","project-a"], filePrefix = ""
      // "evals/project-a/s" → dir segments = ["evals","project-a"], filePrefix = "s"
      const parts = prefix.split("/");
      const filePrefix = parts.pop() || "";
      const dir = join(this.basePath, ...parts);
      const entries = await readdir(dir);
      const toDelete = entries.filter((name) => name.endsWith(".json") && name.startsWith(filePrefix));
      await batchAll(
        toDelete.map((name) => () => unlink(join(dir, name)).catch(() => {})),
        50,
      );
    } catch {
      // Ignore errors during invalidation
    }
  }

  async close(): Promise<void> {
    // No-op for file backend
  }

  /**
   * Remove the entire cache directory. Used by --cache-clear.
   */
  async clearAll(): Promise<void> {
    try {
      await rm(this.basePath, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }
}
