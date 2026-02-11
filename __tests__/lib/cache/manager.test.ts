import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the hash module before importing manager
vi.mock("@/lib/cache/hash", () => ({
  hashSessionFile: vi.fn(),
  hashEvalsModule: vi.fn(),
}));

import { hashSessionFile, hashEvalsModule } from "@/lib/cache/hash";
import {
  initCacheBackend,
  getCachedResult,
  setCachedResult,
  closeCacheBackend,
} from "@/lib/cache/manager";
import type { CacheMeta } from "@/lib/cache/types";

const mockHashSession = vi.mocked(hashSessionFile);
const mockHashEvals = vi.mocked(hashEvalsModule);

const BACKEND_KEY = "__CLAUDEYE_CACHE_BACKEND__";
const DISABLED_KEY = "__CLAUDEYE_CACHE_DISABLED__";

describe("cache manager", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Clean globalThis state between tests
    delete (globalThis as any)[BACKEND_KEY];
    delete (globalThis as any)[DISABLED_KEY];
  });

  afterEach(async () => {
    await closeCacheBackend();
    process.env = originalEnv;
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
