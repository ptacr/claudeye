// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/registry", () => ({
  getRegisteredEvals: vi.fn(() => []),
}));

vi.mock("@/lib/evals/condition-registry", () => ({
  getGlobalCondition: vi.fn(() => null),
}));

import { getRegisteredEvals } from "@/lib/evals/registry";
import { getGlobalCondition } from "@/lib/evals/condition-registry";
import { runAllEvals } from "@/lib/evals/runner";
import type { EvalLogStats } from "@/lib/evals/types";

const mockGetRegisteredEvals = vi.mocked(getRegisteredEvals);
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

describe("evals/runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGlobalCondition.mockReturnValue(null);
  });

  it("returns empty results when no evals registered", async () => {
    mockGetRegisteredEvals.mockReturnValue([]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toEqual([]);
    expect(summary.passCount).toBe(0);
    expect(summary.failCount).toBe(0);
    expect(summary.errorCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
  });

  it("records a passing eval", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "passing", fn: () => ({ pass: true, score: 0.9 }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].pass).toBe(true);
    expect(summary.results[0].score).toBe(0.9);
    expect(summary.passCount).toBe(1);
    expect(summary.failCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
  });

  it("records a failing eval", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "failing", fn: () => ({ pass: false, score: 0.2, message: "bad" }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].pass).toBe(false);
    expect(summary.results[0].score).toBe(0.2);
    expect(summary.results[0].message).toBe("bad");
    expect(summary.failCount).toBe(1);
    expect(summary.skippedCount).toBe(0);
  });

  it("isolates errors — one throwing eval does not block others", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "thrower", fn: () => { throw new Error("boom"); }, scope: "session" as const },
      { name: "ok", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].error).toBe("boom");
    expect(summary.results[0].pass).toBe(false);
    expect(summary.results[0].score).toBe(0);
    expect(summary.results[1].pass).toBe(true);
    expect(summary.errorCount).toBe(1);
    expect(summary.passCount).toBe(1);
    expect(summary.skippedCount).toBe(0);
  });

  it("clamps score > 1 to 1", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "over", fn: () => ({ pass: true, score: 5 }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].score).toBe(1);
  });

  it("clamps score < 0 to 0", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "under", fn: () => ({ pass: true, score: -3 }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].score).toBe(0);
  });

  it("defaults undefined score to 1", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "noScore", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].score).toBe(1);
  });

  it("records timing for each eval", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "slow", fn: async () => { await new Promise((r) => setTimeout(r, 10)); return { pass: true }; }, scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes context with default scope to eval functions", async () => {
    const fn = vi.fn(() => ({ pass: true }));
    mockGetRegisteredEvals.mockReturnValue([{ name: "ctx", fn, scope: "session" }]);
    await runAllEvals(stubEntries, stubStats, "myProj", "mySess");
    expect(fn).toHaveBeenCalledWith({
      entries: stubEntries,
      stats: stubStats,
      projectName: "myProj",
      sessionId: "mySess",
      source: "session",
    });
  });

  it("uses evalsToRun when provided instead of registry", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "registry-eval", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const customEvals = [
      { name: "custom-eval", fn: () => ({ pass: false, score: 0.5 }), scope: "subagent" as const },
    ];
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess", customEvals);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].name).toBe("custom-eval");
    expect(summary.results[0].pass).toBe(false);
  });

  it("applies contextOverrides to eval context", async () => {
    const fn = vi.fn(() => ({ pass: true }));
    const evals = [{ name: "sub-eval", fn, scope: "subagent" as const }];
    await runAllEvals(stubEntries, stubStats, "proj", "sess", evals, {
      source: "agent-abc123",
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
      subagentType: "Explore",
      subagentDescription: "test desc",
      parentSessionId: "sess",
    });
  });

  // --- Global condition tests ---

  it("global condition false → all evals skipped", async () => {
    mockGetGlobalCondition.mockReturnValue(() => false);
    mockGetRegisteredEvals.mockReturnValue([
      { name: "a", fn: () => ({ pass: true }), scope: "session" as const },
      { name: "b", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].skipped).toBe(true);
    expect(summary.skippedCount).toBe(2);
    expect(summary.passCount).toBe(0);
  });

  it("global condition true → evals run normally", async () => {
    mockGetGlobalCondition.mockReturnValue(() => true);
    mockGetRegisteredEvals.mockReturnValue([
      { name: "a", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].pass).toBe(true);
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(0);
    expect(summary.passCount).toBe(1);
  });

  it("no global condition (null) → backward compatible", async () => {
    mockGetGlobalCondition.mockReturnValue(null);
    mockGetRegisteredEvals.mockReturnValue([
      { name: "a", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].pass).toBe(true);
    expect(summary.skippedCount).toBe(0);
  });

  it("global condition throws → all evals skipped", async () => {
    mockGetGlobalCondition.mockReturnValue(() => { throw new Error("condition boom"); });
    mockGetRegisteredEvals.mockReturnValue([
      { name: "a", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.skippedCount).toBe(1);
  });

  // --- Per-eval condition tests ---

  it("per-eval condition false → that eval skipped, others run", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "skipped-one", fn: () => ({ pass: true }), condition: () => false, scope: "session" as const },
      { name: "runs", fn: () => ({ pass: true }), scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].pass).toBe(true);
    expect(summary.results[1].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(1);
    expect(summary.passCount).toBe(1);
  });

  it("per-eval condition true → eval runs", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "conditional", fn: () => ({ pass: true, score: 0.8 }), condition: () => true, scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].pass).toBe(true);
    expect(summary.results[0].score).toBe(0.8);
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(0);
  });

  it("per-eval condition throws → treated as error (not skip)", async () => {
    mockGetRegisteredEvals.mockReturnValue([
      { name: "bad-cond", fn: () => ({ pass: true }), condition: () => { throw new Error("cond fail"); }, scope: "session" as const },
    ]);
    const summary = await runAllEvals(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].error).toBe("Condition error: cond fail");
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.errorCount).toBe(1);
    expect(summary.skippedCount).toBe(0);
  });
});
