// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/loader", () => ({
  ensureEvalsLoaded: vi.fn(),
}));

vi.mock("@/lib/evals/registry", () => ({
  getSessionScopedEvals: vi.fn(() => []),
  getSubagentScopedEvals: vi.fn(() => []),
}));

vi.mock("@/lib/cache", () => ({
  hashSessionFile: vi.fn(),
  hashSubagentFile: vi.fn(),
  hashItemCode: vi.fn(() => "item-hash"),
  getPerItemCache: vi.fn(),
}));

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEvals, getSubagentScopedEvals } from "@/lib/evals/registry";
import { hashSessionFile, hashSubagentFile, hashItemCode, getPerItemCache } from "@/lib/cache";
import { checkEvalCacheAndList } from "@/app/actions/check-eval-cache";
import type { EvalRunResult, RegisteredEval } from "@/lib/evals/types";

const mockEnsureLoaded = vi.mocked(ensureEvalsLoaded);
const mockGetSessionEvals = vi.mocked(getSessionScopedEvals);
const mockGetSubagentEvals = vi.mocked(getSubagentScopedEvals);
const mockHashSession = vi.mocked(hashSessionFile);
const mockHashSubagent = vi.mocked(hashSubagentFile);
const mockHashItemCode = vi.mocked(hashItemCode);
const mockGetPerItemCache = vi.mocked(getPerItemCache);

const stubEvalResult: EvalRunResult = {
  name: "eval-a",
  pass: true,
  score: 1,
  durationMs: 50,
};

const stubEval = (name: string): RegisteredEval => ({ name, fn: () => ({ pass: true, score: 1, name }), scope: "session" });

describe("checkEvalCacheAndList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHashItemCode.mockReturnValue("item-hash");
  });

  it("returns hasEvals:false when no evals registered", async () => {
    mockGetSessionEvals.mockReturnValue([]);
    const result = await checkEvalCacheAndList("proj", "sess");
    expect(result).toEqual({ ok: true, hasEvals: false });
    expect(mockEnsureLoaded).toHaveBeenCalledOnce();
  });

  it("returns all names + cachedResults when all items cached", async () => {
    mockGetSessionEvals.mockReturnValue([stubEval("eval-a"), stubEval("eval-b")]);
    mockHashSession.mockResolvedValue("content-hash");

    const cachedA = { ...stubEvalResult, name: "eval-a" };
    const cachedB = { ...stubEvalResult, name: "eval-b" };
    mockGetPerItemCache
      .mockResolvedValueOnce({ value: cachedA } as any)
      .mockResolvedValueOnce({ value: cachedB } as any);

    const result = await checkEvalCacheAndList("proj", "sess");
    expect(result).toMatchObject({
      ok: true,
      hasEvals: true,
      names: ["eval-a", "eval-b"],
      uncachedNames: [],
    });
    if (result.ok && result.hasEvals) {
      expect(result.cachedResults).toHaveLength(2);
    }
  });

  it("returns uncachedNames for cache misses", async () => {
    mockGetSessionEvals.mockReturnValue([stubEval("eval-a"), stubEval("eval-b")]);
    mockHashSession.mockResolvedValue("content-hash");

    const cachedA = { ...stubEvalResult, name: "eval-a" };
    mockGetPerItemCache
      .mockResolvedValueOnce({ value: cachedA } as any)
      .mockResolvedValueOnce(null);

    const result = await checkEvalCacheAndList("proj", "sess");
    expect(result).toMatchObject({
      ok: true,
      hasEvals: true,
      names: ["eval-a", "eval-b"],
    });
    if (result.ok && result.hasEvals) {
      expect(result.cachedResults).toHaveLength(1);
      expect(result.cachedResults[0].name).toBe("eval-a");
      expect(result.uncachedNames).toEqual(["eval-b"]);
    }
  });

  it("uses subagent scope when agentId provided", async () => {
    mockGetSubagentEvals.mockReturnValue([stubEval("sub-eval")]);
    mockHashSubagent.mockResolvedValue("sub-hash");
    mockGetPerItemCache.mockResolvedValueOnce(null);

    const result = await checkEvalCacheAndList("proj", "sess", "agent-1", "coder");

    expect(mockGetSubagentEvals).toHaveBeenCalledWith("coder");
    expect(mockGetSessionEvals).not.toHaveBeenCalled();
    expect(mockHashSubagent).toHaveBeenCalledWith("proj", "sess", "agent-1");
    expect(mockHashSession).not.toHaveBeenCalled();

    // Verify sessionKey = "${sessionId}/agent-${agentId}"
    expect(mockGetPerItemCache).toHaveBeenCalledWith(
      "evals", "proj", "sess/agent-agent-1", "sub-eval", "item-hash", "sub-hash",
    );

    expect(result).toMatchObject({
      ok: true,
      hasEvals: true,
      names: ["sub-eval"],
      uncachedNames: ["sub-eval"],
    });
  });

  it("returns ok:false on thrown error", async () => {
    mockEnsureLoaded.mockRejectedValueOnce(new Error("load failed"));
    const result = await checkEvalCacheAndList("proj", "sess");
    expect(result).toEqual({ ok: false, error: "load failed" });
  });

  it("returns all uncached when contentHash is falsy", async () => {
    mockGetSessionEvals.mockReturnValue([stubEval("eval-a"), stubEval("eval-b")]);
    mockHashSession.mockResolvedValue("");

    const result = await checkEvalCacheAndList("proj", "sess");
    expect(result).toMatchObject({
      ok: true,
      hasEvals: true,
      names: ["eval-a", "eval-b"],
      cachedResults: [],
      uncachedNames: ["eval-a", "eval-b"],
    });
    expect(mockGetPerItemCache).not.toHaveBeenCalled();
  });
});
