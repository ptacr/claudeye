/**
 * Executes all registered eval functions against a session's log entries.
 * Each eval is individually try/caught so one failure doesn't block others.
 */
import { getRegisteredEvals } from "./registry";
import { getGlobalCondition } from "./condition-registry";
import type { EvalContext, EvalLogStats, EvalRunResult, EvalRunSummary, RegisteredEval } from "./types";

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
  const registeredEvals = evalsToRun ?? getRegisteredEvals();
  const results: EvalRunResult[] = [];
  const overallStart = performance.now();
  const context: EvalContext = { entries, stats, projectName, sessionId, scope: 'session', ...contextOverrides };

  // Check global condition first
  const globalCondition = getGlobalCondition();
  let globalSkip = false;
  if (globalCondition) {
    try {
      const result = await globalCondition(context);
      if (!result) globalSkip = true;
    } catch {
      globalSkip = true;
    }
  }

  if (globalSkip) {
    // All evals skipped due to global condition
    for (const { name } of registeredEvals) {
      results.push({
        name,
        pass: false,
        score: 0,
        durationMs: 0,
        skipped: true,
      });
    }
  } else {
    for (const { name, fn, condition } of registeredEvals) {
      // Check per-eval condition
      if (condition) {
        try {
          const shouldRun = await condition(context);
          if (!shouldRun) {
            results.push({
              name,
              pass: false,
              score: 0,
              durationMs: 0,
              skipped: true,
            });
            continue;
          }
        } catch (err) {
          results.push({
            name,
            pass: false,
            score: 0,
            durationMs: 0,
            error: `Condition error: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }

      const start = performance.now();
      try {
        const result = await fn(context);
        const durationMs = Math.round(performance.now() - start);
        results.push({
          name,
          pass: result.pass,
          score: clampScore(result.score),
          message: result.message,
          metadata: result.metadata,
          durationMs,
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        results.push({
          name,
          pass: false,
          score: 0,
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const totalDurationMs = Math.round(performance.now() - overallStart);
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  for (const r of results) {
    if (r.skipped) skippedCount++;
    else if (r.error) errorCount++;
    else if (r.pass) passCount++;
    else failCount++;
  }

  return { results, totalDurationMs, passCount, failCount, errorCount, skippedCount };
}
