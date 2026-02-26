/**
 * Executes all registered action functions against a session's log entries.
 * Each action is individually try/caught so one failure doesn't block others.
 *
 * Unlike evals/enrichments, actions receive an extended ActionContext that
 * includes cached eval and enrichment results alongside the standard log data.
 */
import { getRegisteredActions } from "./action-registry";
import { runAll } from "./run-all";
import type { EvalContext, EvalLogStats, EvalRunResult } from "./types";
import type { EnrichRunResult } from "./enrich-types";
import type { ActionContext, ActionResult, ActionRunResult, ActionRunSummary, RegisteredAction } from "./action-types";

export async function runAllActions(
  entries: Record<string, unknown>[],
  stats: EvalLogStats,
  projectName: string,
  sessionId: string,
  evalResults: Record<string, EvalRunResult>,
  enrichmentResults: Record<string, EnrichRunResult>,
  actionsToRun?: RegisteredAction[],
  contextOverrides?: Partial<EvalContext>,
): Promise<ActionRunSummary> {
  const items = actionsToRun ?? getRegisteredActions();
  const context: ActionContext = {
    entries, stats, projectName, sessionId, source: 'session',
    ...contextOverrides,
    evalResults,
    enrichmentResults,
  };

  // runAll expects RunnableItem with fn: (ctx: EvalContext) => unknown.
  // ActionContext extends EvalContext, so we wrap each action's fn to pass
  // the full ActionContext regardless of the base type signature.
  const wrappedItems = items.map(item => ({
    ...item,
    fn: (_ctx: EvalContext) => item.fn(context),
  }));

  return runAll(wrappedItems, context, {
    skipResult: (item): ActionRunResult => ({
      name: item.name, status: 'success', durationMs: 0, skipped: true,
    }),
    successResult: (item, fnResult, durationMs): ActionRunResult => {
      const result = fnResult as ActionResult;
      return {
        name: item.name,
        output: result.output,
        data: result.data,
        status: result.status ?? 'success',
        message: result.message,
        durationMs,
      };
    },
    errorResult: (item, error, durationMs): ActionRunResult => ({
      name: item.name, status: 'error', durationMs, error,
    }),
    unexpectedResult: (): ActionRunResult => ({
      name: '?', status: 'error', durationMs: 0, error: 'Unexpected rejection',
    }),
    buildSummary: (results, totalDurationMs) => {
      let errorCount = 0, skippedCount = 0;
      for (const r of results) {
        if (r.skipped) skippedCount++;
        else if (r.status === "error") errorCount++;
      }
      return { results, totalDurationMs, errorCount, skippedCount };
    },
  });
}
