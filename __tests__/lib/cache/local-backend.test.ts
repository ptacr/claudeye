import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalCacheBackend } from "@/lib/cache/local-backend";
import { mkdtemp, rm, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { CacheMeta } from "@/lib/cache/types";

function makeMeta(overrides: Partial<CacheMeta> = {}): CacheMeta {
  return {
    cachedAt: new Date().toISOString(),
    contentHash: "abc123",
    evalsModuleHash: "def456",
    registeredNames: ["eval-1", "eval-2"],
    ...overrides,
  };
}

describe("LocalCacheBackend", () => {
  let tempDir: string;
  let backend: LocalCacheBackend;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "claudeye-cache-test-"));
    backend = new LocalCacheBackend(tempDir);
  });

  afterEach(async () => {
    await backend.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null for non-existent key", async () => {
    const result = await backend.get("evals/project/session");
    expect(result).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    const meta = makeMeta();
    const value = { passCount: 3, failCount: 1 };

    await backend.set("evals/project-a/session-1", value, meta);
    const entry = await backend.get("evals/project-a/session-1");

    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual(value);
    expect(entry!.meta).toEqual(meta);
  });

  it("overwrites existing value on set", async () => {
    const key = "evals/p/s";
    await backend.set(key, { v: 1 }, makeMeta());
    await backend.set(key, { v: 2 }, makeMeta({ contentHash: "new-hash" }));

    const entry = await backend.get(key);
    expect(entry!.value).toEqual({ v: 2 });
    expect(entry!.meta.contentHash).toBe("new-hash");
  });

  it("invalidate removes a single key", async () => {
    const key = "evals/p/s";
    await backend.set(key, { data: true }, makeMeta());
    expect(await backend.get(key)).not.toBeNull();

    await backend.invalidate(key);
    expect(await backend.get(key)).toBeNull();
  });

  it("invalidate is a no-op for non-existent key", async () => {
    // Should not throw
    await backend.invalidate("nonexistent/key");
  });

  it("invalidateByPrefix removes matching keys", async () => {
    await backend.set("evals/project-a/s1", { id: 1 }, makeMeta());
    await backend.set("evals/project-a/s2", { id: 2 }, makeMeta());
    await backend.set("evals/project-b/s1", { id: 3 }, makeMeta());

    await backend.invalidateByPrefix("evals/project-a/");

    expect(await backend.get("evals/project-a/s1")).toBeNull();
    expect(await backend.get("evals/project-a/s2")).toBeNull();
    expect(await backend.get("evals/project-b/s1")).not.toBeNull();
  });

  it("clearAll removes the entire cache directory", async () => {
    await backend.set("evals/p/s", { x: 1 }, makeMeta());
    await backend.clearAll();

    const result = await backend.get("evals/p/s");
    expect(result).toBeNull();
  });

  it("handles complex nested key paths", async () => {
    const key = "enrichments/my-project-name/long-session-id-12345";
    const value = { totalDurationMs: 100, results: [] };
    await backend.set(key, value, makeMeta());

    const entry = await backend.get(key);
    expect(entry!.value).toEqual(value);
  });

  it("close is a no-op and does not throw", async () => {
    await expect(backend.close()).resolves.toBeUndefined();
  });
});
