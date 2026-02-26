// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/action-registry", () => ({
  getRegisteredActions: vi.fn(() => []),
}));

vi.mock("@/lib/evals/condition-registry", () => ({
  getGlobalCondition: vi.fn(() => null),
}));

import { getRegisteredActions } from "@/lib/evals/action-registry";
import { getGlobalCondition } from "@/lib/evals/condition-registry";
import { runAllActions } from "@/lib/evals/action-runner";
import type { EvalLogStats, EvalRunResult } from "@/lib/evals/types";
import type { EnrichRunResult } from "@/lib/evals/enrich-types";
import type { RegisteredAction } from "@/lib/evals/action-types";

const mockGetRegisteredActions = vi.mocked(getRegisteredActions);
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
const stubEvalResults: Record<string, EvalRunResult> = {};
const stubEnrichResults: Record<string, EnrichRunResult> = {};

function makeAction(overrides: Partial<RegisteredAction> & { name: string; fn: RegisteredAction["fn"] }): RegisteredAction {
  return { scope: "session", cache: true, ...overrides };
}

describe("evals/action-runner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetGlobalCondition.mockReturnValue(null);
  });

  it("returns empty results when no actions registered", async () => {
    mockGetRegisteredActions.mockReturnValue([]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results).toEqual([]);
    expect(summary.errorCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
  });

  it("records action output and data", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({
        name: "summary",
        fn: () => ({ output: "Session looks good", data: { turns: 5 }, status: "success" as const }),
      }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].output).toBe("Session looks good");
    expect(summary.results[0].data).toEqual({ turns: 5 });
    expect(summary.results[0].status).toBe("success");
    expect(summary.results[0].error).toBeUndefined();
    expect(summary.errorCount).toBe(0);
  });

  it("isolates errors — one throwing action does not block others", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({ name: "thrower", fn: () => { throw new Error("boom"); } }),
      makeAction({ name: "ok", fn: () => ({ status: "success" as const, output: "fine" }) }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].error).toBe("boom");
    expect(summary.results[1].output).toBe("fine");
    expect(summary.errorCount).toBe(1);
  });

  it("handles async actions", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({
        name: "async",
        fn: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { status: "success" as const, output: "done" };
        },
      }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results[0].output).toBe("done");
  });

  it("records timing for each action", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({
        name: "slow",
        fn: async () => { await new Promise((r) => setTimeout(r, 10)); return { status: "success" as const }; },
      }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes ActionContext with evalResults and enrichmentResults", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = vi.fn((_ctx: any) => ({ status: "success" as const }));
    const evalResults = { "my-eval": { name: "my-eval", pass: true, score: 1, durationMs: 5 } };
    const enrichResults = { "my-enrich": { name: "my-enrich", data: { x: 1 }, durationMs: 3 } };
    const actions = [makeAction({ name: "ctx-test", fn })];
    await runAllActions(stubEntries, stubStats, "proj", "sess", evalResults, enrichResults, actions);
    expect(fn).toHaveBeenCalledTimes(1);
    const ctx = fn.mock.calls[0][0];
    expect(ctx.evalResults).toEqual(evalResults);
    expect(ctx.enrichmentResults).toEqual(enrichResults);
    expect(ctx.projectName).toBe("proj");
    expect(ctx.sessionId).toBe("sess");
  });

  it("uses actionsToRun when provided instead of registry", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({ name: "registry-action", fn: () => ({ status: "success" as const }) }),
    ]);
    const customActions = [
      makeAction({ name: "custom-action", fn: () => ({ status: "success" as const, output: "custom" }) }),
    ];
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults, customActions);
    expect(mockGetRegisteredActions).not.toHaveBeenCalled();
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].name).toBe("custom-action");
    expect(summary.results[0].output).toBe("custom");
  });

  it("applies contextOverrides", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = vi.fn((_ctx: any) => ({ status: "success" as const }));
    const actions = [makeAction({ name: "sub-action", fn })];
    await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults, actions, {
      source: "agent-abc123",
      subagentType: "Explore",
    });
    const ctx = fn.mock.calls[0][0];
    expect(ctx.source).toBe("agent-abc123");
    expect(ctx.subagentType).toBe("Explore");
  });

  // --- Global condition tests ---

  it("global condition false → all actions skipped", async () => {
    mockGetGlobalCondition.mockReturnValue(() => false);
    mockGetRegisteredActions.mockReturnValue([
      makeAction({ name: "a", fn: () => ({ status: "success" as const }) }),
      makeAction({ name: "b", fn: () => ({ status: "success" as const }) }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results).toHaveLength(2);
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].skipped).toBe(true);
    expect(summary.skippedCount).toBe(2);
  });

  it("global condition true → actions run normally", async () => {
    mockGetGlobalCondition.mockReturnValue(() => true);
    mockGetRegisteredActions.mockReturnValue([
      makeAction({ name: "a", fn: () => ({ status: "success" as const, output: "ran" }) }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results[0].output).toBe("ran");
    expect(summary.results[0].skipped).toBeUndefined();
  });

  // --- Per-action condition tests ---

  it("per-action condition false → that action skipped, others run", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({ name: "skipped", fn: () => ({ status: "success" as const }), condition: () => false }),
      makeAction({ name: "runs", fn: () => ({ status: "success" as const, output: "ok" }) }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.results[1].output).toBe("ok");
    expect(summary.skippedCount).toBe(1);
  });

  it("per-action condition throws → treated as error", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({ name: "bad-cond", fn: () => ({ status: "success" as const }), condition: () => { throw new Error("cond fail"); } }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results[0].error).toBe("Condition error: cond fail");
    expect(summary.errorCount).toBe(1);
  });

  it("action returning error status is captured correctly", async () => {
    mockGetRegisteredActions.mockReturnValue([
      makeAction({ name: "fail-action", fn: () => ({ status: "error" as const, message: "something went wrong" }) }),
    ]);
    const summary = await runAllActions(stubEntries, stubStats, "proj", "sess", stubEvalResults, stubEnrichResults);
    expect(summary.results[0].status).toBe("error");
    expect(summary.results[0].message).toBe("something went wrong");
    // Action returned status: "error", so it counts as an error
    expect(summary.errorCount).toBe(1);
  });
});
