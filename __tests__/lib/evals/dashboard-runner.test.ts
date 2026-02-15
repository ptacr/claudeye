// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/dashboard-registry", () => ({
  getRegisteredFilters: vi.fn(() => []),
}));

vi.mock("@/lib/evals/condition-registry", () => ({
  getGlobalCondition: vi.fn(() => null),
}));

import { getRegisteredFilters } from "@/lib/evals/dashboard-registry";
import { getGlobalCondition } from "@/lib/evals/condition-registry";
import { runAllFilters } from "@/lib/evals/dashboard-runner";
import type { EvalLogStats } from "@/lib/evals/types";

const mockGetRegisteredFilters = vi.mocked(getRegisteredFilters);
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

describe("evals/dashboard-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGlobalCondition.mockReturnValue(null);
  });

  it("returns empty results when no filters registered", async () => {
    mockGetRegisteredFilters.mockReturnValue([]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toEqual([]);
    expect(summary.errorCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
  });

  it("records a boolean filter result", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "has-errors", fn: () => true, label: "Has Errors", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].value).toBe(true);
    expect(summary.results[0].name).toBe("has-errors");
  });

  it("records a number filter result", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "turn-count", fn: () => 42, label: "Turn Count", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].value).toBe(42);
  });

  it("records a string filter result", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "model", fn: () => "claude-3", label: "Model", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].value).toBe("claude-3");
  });

  it("isolates errors — one throwing filter does not block others", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "thrower", fn: () => { throw new Error("boom"); }, label: "Thrower", view: "default" },
      { name: "ok", fn: () => true, label: "OK", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].error).toBe("boom");
    expect(summary.results[0].value).toBe(false);
    expect(summary.results[1].value).toBe(true);
    expect(summary.errorCount).toBe(1);
  });

  it("records timing for each filter", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "slow", fn: async () => { await new Promise((r) => setTimeout(r, 10)); return 1; }, label: "Slow", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes context to filter functions", async () => {
    const fn = vi.fn(() => true);
    mockGetRegisteredFilters.mockReturnValue([{ name: "ctx", fn, label: "Ctx", view: "default" }]);
    await runAllFilters(stubEntries, stubStats, "myProj", "mySess");
    expect(fn).toHaveBeenCalledWith({
      entries: stubEntries,
      stats: stubStats,
      projectName: "myProj",
      sessionId: "mySess",
      source: "session",
    });
  });

  it("uses filtersToRun when provided instead of registry", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "registry-filter", fn: () => true, label: "Registry", view: "default" },
    ]);
    const customFilters = [
      { name: "custom-filter", fn: () => "custom", label: "Custom", view: "default" },
    ];
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess", customFilters);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].name).toBe("custom-filter");
    expect(summary.results[0].value).toBe("custom");
  });

  // --- Global condition tests ---

  it("global condition false → all filters skipped", async () => {
    mockGetGlobalCondition.mockReturnValue(() => false);
    mockGetRegisteredFilters.mockReturnValue([
      { name: "a", fn: () => true, label: "A", view: "default" },
      { name: "b", fn: () => 42, label: "B", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].skipped).toBe(true);
    expect(summary.skippedCount).toBe(2);
  });

  it("global condition true → filters run normally", async () => {
    mockGetGlobalCondition.mockReturnValue(() => true);
    mockGetRegisteredFilters.mockReturnValue([
      { name: "a", fn: () => true, label: "A", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].value).toBe(true);
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(0);
  });

  it("no global condition (null) → backward compatible", async () => {
    mockGetGlobalCondition.mockReturnValue(null);
    mockGetRegisteredFilters.mockReturnValue([
      { name: "a", fn: () => "hello", label: "A", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].value).toBe("hello");
    expect(summary.skippedCount).toBe(0);
  });

  it("global condition throws → all filters skipped", async () => {
    mockGetGlobalCondition.mockReturnValue(() => { throw new Error("condition boom"); });
    mockGetRegisteredFilters.mockReturnValue([
      { name: "a", fn: () => true, label: "A", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.skippedCount).toBe(1);
  });

  // --- Per-filter condition tests ---

  it("per-filter condition false → that filter skipped, others run", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "skipped-one", fn: () => true, condition: () => false, label: "Skipped", view: "default" },
      { name: "runs", fn: () => 99, label: "Runs", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].value).toBe(99);
    expect(summary.results[1].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(1);
  });

  it("per-filter condition true → filter runs", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "conditional", fn: () => "yes", condition: () => true, label: "Conditional", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].value).toBe("yes");
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.skippedCount).toBe(0);
  });

  it("per-filter condition throws → treated as error", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "bad-cond", fn: () => true, condition: () => { throw new Error("cond fail"); }, label: "Bad", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].error).toBe("Condition error: cond fail");
    expect(summary.results[0].skipped).toBeUndefined();
    expect(summary.errorCount).toBe(1);
    expect(summary.skippedCount).toBe(0);
  });

  it("handles async filter functions", async () => {
    mockGetRegisteredFilters.mockReturnValue([
      { name: "async-filter", fn: async () => "async-result", label: "Async", view: "default" },
    ]);
    const summary = await runAllFilters(stubEntries, stubStats, "proj", "sess");
    expect(summary.results[0].value).toBe("async-result");
  });
});
