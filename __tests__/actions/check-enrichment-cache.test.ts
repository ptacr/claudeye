// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/loader", () => ({
  ensureEvalsLoaded: vi.fn(),
}));

vi.mock("@/lib/evals/enrich-registry", () => ({
  getSessionScopedEnrichers: vi.fn(() => []),
  getSubagentScopedEnrichers: vi.fn(() => []),
}));

vi.mock("@/lib/cache", () => ({
  hashSessionFile: vi.fn(),
  hashSubagentFile: vi.fn(),
  hashItemCode: vi.fn(() => "item-hash"),
  getPerItemCache: vi.fn(),
}));

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEnrichers, getSubagentScopedEnrichers } from "@/lib/evals/enrich-registry";
import { hashSessionFile, hashSubagentFile, hashItemCode, getPerItemCache } from "@/lib/cache";
import { checkEnrichmentCacheAndList } from "@/app/actions/check-enrichment-cache";
import type { EnrichRunResult, RegisteredEnricher } from "@/lib/evals/enrich-types";

const mockEnsureLoaded = vi.mocked(ensureEvalsLoaded);
const mockGetSessionEnrichers = vi.mocked(getSessionScopedEnrichers);
const mockGetSubagentEnrichers = vi.mocked(getSubagentScopedEnrichers);
const mockHashSession = vi.mocked(hashSessionFile);
const mockHashSubagent = vi.mocked(hashSubagentFile);
const mockHashItemCode = vi.mocked(hashItemCode);
const mockGetPerItemCache = vi.mocked(getPerItemCache);

const stubEnrichResult: EnrichRunResult = {
  name: "enricher-a",
  data: { key: "value" },
  durationMs: 30,
};

const stubEnricher = (name: string): RegisteredEnricher => ({ name, fn: () => ({ key: "val" }), scope: "session" });

describe("checkEnrichmentCacheAndList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHashItemCode.mockReturnValue("item-hash");
  });

  it("returns hasEnrichers:false when no enrichers registered", async () => {
    mockGetSessionEnrichers.mockReturnValue([]);
    const result = await checkEnrichmentCacheAndList("proj", "sess");
    expect(result).toEqual({ ok: true, hasEnrichers: false });
    expect(mockEnsureLoaded).toHaveBeenCalledOnce();
  });

  it("returns all names + cachedResults when all items cached", async () => {
    mockGetSessionEnrichers.mockReturnValue([stubEnricher("enricher-a"), stubEnricher("enricher-b")]);
    mockHashSession.mockResolvedValue("content-hash");

    const cachedA = { ...stubEnrichResult, name: "enricher-a" };
    const cachedB = { ...stubEnrichResult, name: "enricher-b" };
    mockGetPerItemCache
      .mockResolvedValueOnce({ value: cachedA } as any)
      .mockResolvedValueOnce({ value: cachedB } as any);

    const result = await checkEnrichmentCacheAndList("proj", "sess");
    expect(result).toMatchObject({
      ok: true,
      hasEnrichers: true,
      names: ["enricher-a", "enricher-b"],
      uncachedNames: [],
    });
    if (result.ok && result.hasEnrichers) {
      expect(result.cachedResults).toHaveLength(2);
    }
  });

  it("returns uncachedNames for cache misses", async () => {
    mockGetSessionEnrichers.mockReturnValue([stubEnricher("enricher-a"), stubEnricher("enricher-b")]);
    mockHashSession.mockResolvedValue("content-hash");

    const cachedA = { ...stubEnrichResult, name: "enricher-a" };
    mockGetPerItemCache
      .mockResolvedValueOnce({ value: cachedA } as any)
      .mockResolvedValueOnce(null);

    const result = await checkEnrichmentCacheAndList("proj", "sess");
    expect(result).toMatchObject({
      ok: true,
      hasEnrichers: true,
      names: ["enricher-a", "enricher-b"],
    });
    if (result.ok && result.hasEnrichers) {
      expect(result.cachedResults).toHaveLength(1);
      expect(result.cachedResults[0].name).toBe("enricher-a");
      expect(result.uncachedNames).toEqual(["enricher-b"]);
    }
  });

  it("uses subagent scope when agentId provided", async () => {
    mockGetSubagentEnrichers.mockReturnValue([stubEnricher("sub-enricher")]);
    mockHashSubagent.mockResolvedValue("sub-hash");
    mockGetPerItemCache.mockResolvedValueOnce(null);

    const result = await checkEnrichmentCacheAndList("proj", "sess", "agent-1", "coder");

    expect(mockGetSubagentEnrichers).toHaveBeenCalledWith("coder");
    expect(mockGetSessionEnrichers).not.toHaveBeenCalled();
    expect(mockHashSubagent).toHaveBeenCalledWith("proj", "sess", "agent-1");
    expect(mockHashSession).not.toHaveBeenCalled();

    // Verify sessionKey = "${sessionId}/agent-${agentId}"
    expect(mockGetPerItemCache).toHaveBeenCalledWith(
      "enrichments", "proj", "sess/agent-agent-1", "sub-enricher", "item-hash", "sub-hash",
    );

    expect(result).toMatchObject({
      ok: true,
      hasEnrichers: true,
      names: ["sub-enricher"],
      uncachedNames: ["sub-enricher"],
    });
  });

  it("returns ok:false on thrown error", async () => {
    mockEnsureLoaded.mockRejectedValueOnce(new Error("load failed"));
    const result = await checkEnrichmentCacheAndList("proj", "sess");
    expect(result).toEqual({ ok: false, error: "load failed" });
  });

  it("returns all uncached when contentHash is falsy", async () => {
    mockGetSessionEnrichers.mockReturnValue([stubEnricher("enricher-a"), stubEnricher("enricher-b")]);
    mockHashSession.mockResolvedValue("");

    const result = await checkEnrichmentCacheAndList("proj", "sess");
    expect(result).toMatchObject({
      ok: true,
      hasEnrichers: true,
      names: ["enricher-a", "enricher-b"],
      cachedResults: [],
      uncachedNames: ["enricher-a", "enricher-b"],
    });
    expect(mockGetPerItemCache).not.toHaveBeenCalled();
  });
});
