import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Mock the hash module before importing manager
vi.mock("@/lib/cache/hash", () => ({
  hashSessionFile: vi.fn(),
  hashEvalsModule: vi.fn(),
  hashProjectsPath: vi.fn().mockReturnValue("ab12cd34"),
  hashItemCode: vi.fn(),
}));

import { hashSessionFile, hashEvalsModule, hashProjectsPath, hashItemCode } from "@/lib/cache/hash";
import {
  initCacheBackend,
  getCachedResult,
  setCachedResult,
  getPerItemCache,
  setPerItemCache,
  closeCacheBackend,
} from "@/lib/cache/manager";
import type { CacheMeta, ItemCacheMeta } from "@/lib/cache/types";

const mockHashSession = vi.mocked(hashSessionFile);
const mockHashEvals = vi.mocked(hashEvalsModule);
const mockHashPath = vi.mocked(hashProjectsPath);
const mockHashItemCode = vi.mocked(hashItemCode);

const BACKEND_KEY = "__CLAUDEYE_CACHE_BACKEND__";
const DISABLED_KEY = "__CLAUDEYE_CACHE_DISABLED__";

describe("cache manager", () => {
  const originalEnv = process.env;
  let tmpCacheDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Clean globalThis state between tests
    delete (globalThis as any)[BACKEND_KEY];
    delete (globalThis as any)[DISABLED_KEY];
    // Use a fresh temp directory for each test to avoid cross-test pollution
    tmpCacheDir = await mkdtemp(join(tmpdir(), "claudeye-cache-test-"));
    process.env.CLAUDEYE_CACHE_PATH = tmpCacheDir;
  });

  afterEach(async () => {
    await closeCacheBackend();
    process.env = originalEnv;
    await rm(tmpCacheDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("initCacheBackend", () => {
    it("returns a backend when cache is enabled (default)", () => {
      const backend = initCacheBackend();
      expect(backend).not.toBeNull();
    });

    it("returns null when CLAUDEYE_CACHE=off", () => {
      process.env.CLAUDEYE_CACHE = "off";
      const backend = initCacheBackend();
      expect(backend).toBeNull();
    });

    it("is idempotent (returns same backend)", () => {
      const a = initCacheBackend();
      const b = initCacheBackend();
      expect(a).toBe(b);
    });

    it("stays disabled after first disable check", () => {
      process.env.CLAUDEYE_CACHE = "off";
      initCacheBackend();
      // Even if env changes, stays disabled for this runtime
      delete process.env.CLAUDEYE_CACHE;
      expect(initCacheBackend()).toBeNull();
    });
  });

  describe("getCachedResult", () => {
    it("returns null when cache is disabled", async () => {
      process.env.CLAUDEYE_CACHE = "off";
      const result = await getCachedResult("evals", "proj", "sess", ["eval-1"]);
      expect(result).toBeNull();
    });

    it("returns null on cache miss", async () => {
      // Backend is initialized but no data stored
      const result = await getCachedResult("evals", "proj", "sess", ["eval-1"]);
      expect(result).toBeNull();
    });

    it("returns cached value when all hashes match", async () => {
      mockHashSession.mockResolvedValue("session-hash-1");
      mockHashEvals.mockResolvedValue("evals-hash-1");

      const summary = { passCount: 5, failCount: 0 };
      await setCachedResult("evals", "proj", "sess", summary, ["eval-1", "eval-2"]);

      const result = await getCachedResult("evals", "proj", "sess", ["eval-1", "eval-2"]);
      expect(result).not.toBeNull();
      expect(result!.value).toEqual(summary);
      expect(result!.cached).toBe(true);
    });

    it("returns null when session hash changes", async () => {
      mockHashSession.mockResolvedValue("session-hash-1");
      mockHashEvals.mockResolvedValue("evals-hash-1");

      await setCachedResult("evals", "proj", "sess", { data: true }, ["eval-1"]);

      // Session file changed
      mockHashSession.mockResolvedValue("session-hash-2");

      const result = await getCachedResult("evals", "proj", "sess", ["eval-1"]);
      expect(result).toBeNull();
    });

    it("returns null when evals module hash changes", async () => {
      mockHashSession.mockResolvedValue("session-hash-1");
      mockHashEvals.mockResolvedValue("evals-hash-1");

      await setCachedResult("evals", "proj", "sess", { data: true }, ["eval-1"]);

      // Evals module changed
      mockHashEvals.mockResolvedValue("evals-hash-2");

      const result = await getCachedResult("evals", "proj", "sess", ["eval-1"]);
      expect(result).toBeNull();
    });

    it("returns null when registered names change", async () => {
      mockHashSession.mockResolvedValue("session-hash-1");
      mockHashEvals.mockResolvedValue("evals-hash-1");

      await setCachedResult("evals", "proj", "sess", { data: true }, ["eval-1"]);

      // Different registered names
      const result = await getCachedResult("evals", "proj", "sess", ["eval-1", "eval-2"]);
      expect(result).toBeNull();
    });

    it("matches registered names regardless of order", async () => {
      mockHashSession.mockResolvedValue("session-hash-1");
      mockHashEvals.mockResolvedValue("evals-hash-1");

      await setCachedResult("evals", "proj", "sess", { data: true }, ["eval-b", "eval-a"]);

      const result = await getCachedResult("evals", "proj", "sess", ["eval-a", "eval-b"]);
      expect(result).not.toBeNull();
    });
  });

  describe("setCachedResult", () => {
    it("does not throw when cache is disabled", async () => {
      process.env.CLAUDEYE_CACHE = "off";
      await expect(
        setCachedResult("evals", "proj", "sess", { data: true }, ["eval-1"]),
      ).resolves.toBeUndefined();
    });

    it("stores enrichment results separately from eval results", async () => {
      mockHashSession.mockResolvedValue("hash-1");
      mockHashEvals.mockResolvedValue("hash-2");

      await setCachedResult("evals", "proj", "sess", { type: "eval" }, ["e1"]);
      await setCachedResult("enrichments", "proj", "sess", { type: "enrich" }, ["n1"]);

      const evalResult = await getCachedResult("evals", "proj", "sess", ["e1"]);
      const enrichResult = await getCachedResult("enrichments", "proj", "sess", ["n1"]);

      expect(evalResult!.value).toEqual({ type: "eval" });
      expect(enrichResult!.value).toEqual({ type: "enrich" });
    });
  });

  describe("overrideContentHash", () => {
    it("uses overrideContentHash for getCachedResult instead of hashSessionFile", async () => {
      mockHashEvals.mockResolvedValue("evals-hash");

      // Store with override hash
      await setCachedResult("evals", "proj", "sess/agent-abc", { data: true }, ["e1"], "subagent-hash-1");

      // hashSessionFile should not be called when override is provided
      mockHashSession.mockClear();

      const result = await getCachedResult("evals", "proj", "sess/agent-abc", ["e1"], "subagent-hash-1");
      expect(result).not.toBeNull();
      expect(result!.value).toEqual({ data: true });
      // hashSessionFile should NOT have been called since we provided override
      expect(mockHashSession).not.toHaveBeenCalled();
    });

    it("returns null when overrideContentHash doesn't match stored hash", async () => {
      mockHashEvals.mockResolvedValue("evals-hash");

      await setCachedResult("evals", "proj", "sess/agent-abc", { data: true }, ["e1"], "subagent-hash-1");

      const result = await getCachedResult("evals", "proj", "sess/agent-abc", ["e1"], "subagent-hash-2");
      expect(result).toBeNull();
    });

    it("supports composite session keys for subagent caching", async () => {
      mockHashEvals.mockResolvedValue("evals-hash");

      await setCachedResult("evals", "proj", "sess/agent-abc", { subagent: true }, ["e1"], "hash-1");
      await setCachedResult("evals", "proj", "sess", { session: true }, ["e1"], "hash-2");

      const subResult = await getCachedResult("evals", "proj", "sess/agent-abc", ["e1"], "hash-1");
      const sessResult = await getCachedResult("evals", "proj", "sess", ["e1"], "hash-2");

      expect(subResult!.value).toEqual({ subagent: true });
      expect(sessResult!.value).toEqual({ session: true });
    });
  });

  describe("filters kind", () => {
    it("round-trips filter results with kind='filters'", async () => {
      mockHashSession.mockResolvedValue("session-hash-1");
      mockHashEvals.mockResolvedValue("evals-hash-1");

      const filterSummary = { results: [{ name: "has-error", value: true }], totalDurationMs: 10 };
      await setCachedResult("filters", "proj", "default/sess", filterSummary, ["has-error"]);

      const result = await getCachedResult("filters", "proj", "default/sess", ["has-error"]);
      expect(result).not.toBeNull();
      expect(result!.value).toEqual(filterSummary);
      expect(result!.cached).toBe(true);
    });

    it("isolates kinds — evals and filters with same project/session do not collide", async () => {
      mockHashSession.mockResolvedValue("hash-1");
      mockHashEvals.mockResolvedValue("hash-2");

      await setCachedResult("evals", "proj", "sess", { type: "eval" }, ["e1"]);
      await setCachedResult("filters", "proj", "sess", { type: "filter" }, ["f1"]);

      const evalResult = await getCachedResult("evals", "proj", "sess", ["e1"]);
      const filterResult = await getCachedResult("filters", "proj", "sess", ["f1"]);

      expect(evalResult!.value).toEqual({ type: "eval" });
      expect(filterResult!.value).toEqual({ type: "filter" });
    });
  });

  describe("getPerItemCache / setPerItemCache", () => {
    it("returns null when cache is disabled", async () => {
      process.env.CLAUDEYE_CACHE = "off";
      const result = await getPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1");
      expect(result).toBeNull();
    });

    it("returns null on cache miss", async () => {
      const result = await getPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", "content-hash-1");
      expect(result).toBeNull();
    });

    it("returns cached value when contentHash + itemCodeHash match", async () => {
      const value = { name: "eval-1", pass: true, score: 1, durationMs: 5 };
      await setPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", value, "content-hash-1");

      const result = await getPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", "content-hash-1");
      expect(result).not.toBeNull();
      expect(result!.value).toEqual(value);
      expect(result!.cached).toBe(true);
    });

    it("returns null when contentHash changes (session data changed)", async () => {
      const value = { name: "eval-1", pass: true, score: 1, durationMs: 5 };
      await setPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", value, "content-hash-1");

      const result = await getPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", "content-hash-2");
      expect(result).toBeNull();
    });

    it("returns null when itemCodeHash changes (function code edited)", async () => {
      const value = { name: "eval-1", pass: true, score: 1, durationMs: 5 };
      await setPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", value, "content-hash-1");

      const result = await getPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-2", "content-hash-1");
      expect(result).toBeNull();
    });

    it("adding a new item doesn't invalidate existing items' caches", async () => {
      const value1 = { name: "eval-1", pass: true, score: 1, durationMs: 5 };
      const value2 = { name: "eval-2", pass: false, score: 0, durationMs: 10 };

      await setPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", value1, "content-hash-1");
      await setPerItemCache("evals", "proj", "sess", "eval-2", "code-hash-2", value2, "content-hash-1");

      // Both should still be retrievable independently
      const result1 = await getPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", "content-hash-1");
      const result2 = await getPerItemCache("evals", "proj", "sess", "eval-2", "code-hash-2", "content-hash-1");

      expect(result1!.value).toEqual(value1);
      expect(result2!.value).toEqual(value2);

      // Adding a third item doesn't affect the first two
      const value3 = { name: "eval-3", pass: true, score: 0.5, durationMs: 3 };
      await setPerItemCache("evals", "proj", "sess", "eval-3", "code-hash-3", value3, "content-hash-1");

      const result1Again = await getPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", "content-hash-1");
      expect(result1Again!.value).toEqual(value1);
    });

    it("items are isolated — different names don't collide", async () => {
      const valueA = { name: "eval-a", data: "A" };
      const valueB = { name: "eval-b", data: "B" };

      await setPerItemCache("evals", "proj", "sess", "eval-a", "code-a", valueA, "content-hash-1");
      await setPerItemCache("evals", "proj", "sess", "eval-b", "code-b", valueB, "content-hash-1");

      const resultA = await getPerItemCache("evals", "proj", "sess", "eval-a", "code-a", "content-hash-1");
      const resultB = await getPerItemCache("evals", "proj", "sess", "eval-b", "code-b", "content-hash-1");

      expect(resultA!.value).toEqual(valueA);
      expect(resultB!.value).toEqual(valueB);
    });

    it("uses overrideContentHash instead of hashSessionFile when provided", async () => {
      const value = { name: "eval-1", pass: true };
      await setPerItemCache("evals", "proj", "sess/agent-abc", "eval-1", "code-hash-1", value, "subagent-hash-1");

      mockHashSession.mockClear();

      const result = await getPerItemCache("evals", "proj", "sess/agent-abc", "eval-1", "code-hash-1", "subagent-hash-1");
      expect(result).not.toBeNull();
      expect(result!.value).toEqual(value);
      expect(mockHashSession).not.toHaveBeenCalled();
    });

    it("does not throw when cache is disabled on set", async () => {
      process.env.CLAUDEYE_CACHE = "off";
      await expect(
        setPerItemCache("evals", "proj", "sess", "eval-1", "code-hash-1", { data: true }, "content-hash-1"),
      ).resolves.toBeUndefined();
    });

    it("isolates evals from enrichments at per-item level", async () => {
      const evalValue = { name: "item-1", type: "eval" };
      const enrichValue = { name: "item-1", type: "enrich" };

      await setPerItemCache("evals", "proj", "sess", "item-1", "code-1", evalValue, "content-hash-1");
      await setPerItemCache("enrichments", "proj", "sess", "item-1", "code-1", enrichValue, "content-hash-1");

      const evalResult = await getPerItemCache("evals", "proj", "sess", "item-1", "code-1", "content-hash-1");
      const enrichResult = await getPerItemCache("enrichments", "proj", "sess", "item-1", "code-1", "content-hash-1");

      expect(evalResult!.value).toEqual(evalValue);
      expect(enrichResult!.value).toEqual(enrichValue);
    });
  });

  describe("closeCacheBackend", () => {
    it("clears the globalThis backend", async () => {
      initCacheBackend();
      expect((globalThis as any)[BACKEND_KEY]).toBeDefined();

      await closeCacheBackend();
      expect((globalThis as any)[BACKEND_KEY]).toBeUndefined();
    });

    it("is safe to call multiple times", async () => {
      await closeCacheBackend();
      await closeCacheBackend();
    });
  });
});
