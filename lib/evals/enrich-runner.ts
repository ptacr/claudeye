/**
 * Executes all registered enricher functions against a session's log entries.
 * Each enricher is individually try/caught so one failure doesn't block others.
 */
import { getRegisteredEnrichers } from "./enrich-registry";
import { getGlobalCondition } from "./condition-registry";
import type { EvalContext, EvalLogStats } from "./types";
import type { EnrichRunResult, EnrichRunSummary, RegisteredEnricher } from "./enrich-types";

export async function runAllEnrichers(
  entries: Record<string, unknown>[],
  stats: EvalLogStats,
  projectName: string,
  sessionId: string,
  enrichersToRun?: RegisteredEnricher[],
  contextOverrides?: Partial<EvalContext>,
): Promise<EnrichRunSummary> {
  const registeredEnrichers = enrichersToRun ?? getRegisteredEnrichers();
  const results: EnrichRunResult[] = [];
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
    // All enrichers skipped due to global condition
    for (const { name } of registeredEnrichers) {
      results.push({
        name,
        data: {},
        durationMs: 0,
        skipped: true,
      });
    }
  } else {
    for (const { name, fn, condition } of registeredEnrichers) {
      // Check per-enrichment condition
      if (condition) {
        try {
          const shouldRun = await condition(context);
          if (!shouldRun) {
            results.push({
              name,
              data: {},
              durationMs: 0,
              skipped: true,
            });
            continue;
          }
        } catch (err) {
          results.push({
            name,
            data: {},
            durationMs: 0,
            error: `Condition error: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
      }

      const start = performance.now();
      try {
        const data = await fn(context);
        const durationMs = Math.round(performance.now() - start);
        results.push({ name, data, durationMs });
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        results.push({
          name,
          data: {},
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const totalDurationMs = Math.round(performance.now() - overallStart);
  let errorCount = 0;
  let skippedCount = 0;
  for (const r of results) {
    if (r.skipped) skippedCount++;
    else if (r.error) errorCount++;
  }

  return { results, totalDurationMs, errorCount, skippedCount };
}
