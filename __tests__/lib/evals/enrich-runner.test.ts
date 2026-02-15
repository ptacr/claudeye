// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/enrich-registry", () => ({
  getRegisteredEnrichers: vi.fn(() => []),
}));

vi.mock("@/lib/evals/condition-registry", () => ({
  getGlobalCondition: vi.fn(() => null),
}));

import { getRegisteredEnrichers } from "@/lib/evals/enrich-registry";
import { getGlobalCondition } from "@/lib/evals/condition-registry";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import type { EvalLogStats } from "@/lib/evals/types";

const mockGetRegisteredEnrichers = vi.mocked(getRegisteredEnrichers);
const mockGetGlobalCondition = vi.mocked(getGlobalCondition);

const stubEntries: Record<string, unknown>[] = [];
const stubStats: EvalLogStats = {
  turnCount: 1,
  userCount: 1,
  assistantCount: 1,
  toolCallCount: 0,
  subagentCount: 0,
  duration: "1s",
  models: ["test-model"],
};

describe("evals/enrich-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGlobalCondition.mockReturnValue(null);
  });

  it("returns empty results when no enrichers registered", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toEqual([]);
    expect(summary.errorCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
  });

  it("records enrichment data", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "metrics", fn: () => ({ "Total Tokens": 500, "Has Errors": false }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].data).toEqual({ "Total Tokens": 500, "Has Errors": false });
    expect(summary.results[0].error).toBeUndefined();
    expect(summary.errorCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
  });

  it("isolates errors — one throwing enricher does not block others", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "thrower", fn: () => { throw new Error("boom"); }, scope: "session" as const },
      { name: "ok", fn: () => ({ status: "healthy" }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].error).toBe("boom");
    expect(summary.results[0].data).toEqual({});
    expect(summary.results[1].data).toEqual({ status: "healthy" });
    expect(summary.errorCount).toBe(1);
    expect(summary.skippedCount).toBe(0);
  });

  it("handles async enrichers", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      {
        name: "async",
        fn: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { computed: 42 };
        },
        scope: "session" as const,
      },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].data).toEqual({ computed: 42 });
  });

  it("records timing for each enricher", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "slow", fn: async () => { await new Promise((r) => setTimeout(r, 10)); return { v: 1 }; }, scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes context with default scope to enricher functions", async () => {
    const fn = vi.fn(() => ({ val: true }));
    mockGetRegisteredEnrichers.mockReturnValue([{ name: "ctx", fn, scope: "session" }]);
    await runAllEnrichers(stubEntries, stubStats, "myProj", "mySess");
    expect(fn).toHaveBeenCalledWith({
      entries: stubEntries,
      stats: stubStats,
      projectName: "myProj",
      sessionId: "mySess",
      source: "session",
    });
  });

  it("uses enrichersToRun when provided instead of registry", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "registry-enricher", fn: () => ({ x: 1 }), scope: "session" as const },
    ]);
    const customEnrichers = [
      { name: "custom-enricher", fn: () => ({ y: 2 }), scope: "subagent" as const },
    ];
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess", customEnrichers);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].name).toBe("custom-enricher");
    expect(summary.results[0].data).toEqual({ y: 2 });
  });

  it("applies contextOverrides to enricher context", async () => {
    const fn = vi.fn(() => ({ val: true }));
    const enrichers = [{ name: "sub-enricher", fn, scope: "subagent" as const }];
    await runAllEnrichers(stubEntries, stubStats, "proj", "sess", enrichers, {
      source: "agent-abc123",
      subagentId: "abc123",
      subagentType: "Explore",
      subagentDescription: "test desc",
      parentSessionId: "sess",
    });
    expect(fn).toHaveBeenCalledWith({
      entries: stubEntries,
      stats: stubStats,
      projectName: "proj",
      sessionId: "sess",
      source: "agent-abc123",
      subagentId: "abc123",
      subagentType: "Explore",
      subagentDescription: "test desc",
      parentSessionId: "sess",
    });
  });

  it("handles multiple enrichers", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "a", fn: () => ({ x: 1 }), scope: "session" as const },
      { name: "b", fn: () => ({ y: "two" }), scope: "session" as const },
      { name: "c", fn: () => ({ z: true }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(3);
    expect(summary.results[0].name).toBe("a");
    expect(summary.results[1].name).toBe("b");
    expect(summary.results[2].name).toBe("c");
    expect(summary.skippedCount).toBe(0);
  });

  // --- Global condition tests ---

  it("global condition false → all enrichers skipped", async () => {
    mockGetGlobalCondition.mockReturnValue(() => false);
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "a", fn: () => ({ x: 1 }), scope: "session" as const },
      { name: "b", fn: () => ({ y: 2 }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].skipped).toBe(true);
    expect(summary.skippedCount).toBe(2);
    expect(summary.errorCount).toBe(0);
  });

  it("global condition true → enrichers run normally", async () => {
    mockGetGlobalCondition.mockReturnValue(() => true);
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "a", fn: () => ({ x: 1 }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].data).toEqual({ x: 1 });
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(0);
  });

  it("no global condition (null) → backward compatible", async () => {
    mockGetGlobalCondition.mockReturnValue(null);
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "a", fn: () => ({ x: 1 }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].data).toEqual({ x: 1 });
    expect(summary.skippedCount).toBe(0);
  });

  it("global condition throws → all enrichers skipped", async () => {
    mockGetGlobalCondition.mockReturnValue(() => { throw new Error("condition boom"); });
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "a", fn: () => ({ x: 1 }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.skippedCount).toBe(1);
  });

  // --- Per-enrichment condition tests ---

  it("per-enrichment condition false → that enricher skipped, others run", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "skipped-one", fn: () => ({ x: 1 }), condition: () => false, scope: "session" as const },
      { name: "runs", fn: () => ({ y: 2 }), scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].data).toEqual({ y: 2 });
    expect(summary.results[1].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(1);
  });

  it("per-enrichment condition true → enricher runs", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "conditional", fn: () => ({ val: 42 }), condition: () => true, scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].data).toEqual({ val: 42 });
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(0);
  });

  it("per-enrichment condition throws → treated as error (not skip)", async () => {
    mockGetRegisteredEnrichers.mockReturnValue([
      { name: "bad-cond", fn: () => ({ x: 1 }), condition: () => { throw new Error("cond fail"); }, scope: "session" as const },
    ]);
    const summary = await runAllEnrichers(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].error).toBe("Condition error: cond fail");
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.errorCount).toBe(1);
    expect(summary.skippedCount).toBe(0);
  });
});
