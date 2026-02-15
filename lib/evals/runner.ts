/**
 * Executes all registered eval functions against a session's log entries.
 * Each eval is individually try/caught so one failure doesn't block others.
 */
import { getRegisteredEvals } from "./registry";
import { runAll } from "./run-all";
import type { EvalContext, EvalLogStats, EvalResult, EvalRunResult, EvalRunSummary, RegisteredEval } from "./types";

function clampScore(score: number | undefined): number {
  if (score === undefined || score === null) return 1;
  return Math.max(0, Math.min(1, score));
}

export async function runAllEvals(
  entries: Record<string, unknown>[],
  stats: EvalLogStats,
  projectName: string,
  sessionId: string,
  evalsToRun?: RegisteredEval[],
  contextOverrides?: Partial<EvalContext>,
): Promise<EvalRunSummary> {
  const items = evalsToRun ?? getRegisteredEvals();
  const context: EvalContext = { entries, stats, projectName, sessionId, source: 'session', ...contextOverrides };

  return runAll(items, context, {
    skipResult: (item): EvalRunResult => ({
      name: item.name, pass: false, score: 0, durationMs: 0, skipped: true,
    }),
    successResult: (item, fnResult, durationMs): EvalRunResult => {
      const r = fnResult as EvalResult;
      return {
        name: item.name, pass: r.pass, score: clampScore(r.score),
        message: r.message, metadata: r.metadata, durationMs,
      };
    },
    errorResult: (item, error, durationMs): EvalRunResult => ({
      name: item.name, pass: false, score: 0, durationMs, error,
    }),
    unexpectedResult: (): EvalRunResult => ({
      name: '?', pass: false, score: 0, durationMs: 0, error: 'Unexpected rejection',
    }),
    buildSummary: (results, totalDurationMs) => {
      let passCount = 0, failCount = 0, errorCount = 0, skippedCount = 0;
      for (const r of results) {
        if (r.skipped) skippedCount++;
        else if (r.error) errorCount++;
        else if (r.pass) passCount++;
        else failCount++;
      }
      return { results, totalDurationMs, passCount, failCount, errorCount, skippedCount };
    },
  });
}
