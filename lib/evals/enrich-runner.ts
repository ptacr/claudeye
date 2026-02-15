/**
 * Executes all registered enricher functions against a session's log entries.
 * Each enricher is individually try/caught so one failure doesn't block others.
 */
import { getRegisteredEnrichers } from "./enrich-registry";
import { runAll } from "./run-all";
import type { EvalContext, EvalLogStats } from "./types";
import type { EnrichmentResult, EnrichRunResult, EnrichRunSummary, RegisteredEnricher } from "./enrich-types";

export async function runAllEnrichers(
  entries: Record<string, unknown>[],
  stats: EvalLogStats,
  projectName: string,
  sessionId: string,
  enrichersToRun?: RegisteredEnricher[],
  contextOverrides?: Partial<EvalContext>,
): Promise<EnrichRunSummary> {
  const items = enrichersToRun ?? getRegisteredEnrichers();
  const context: EvalContext = { entries, stats, projectName, sessionId, source: 'session', ...contextOverrides };

  return runAll(items, context, {
    skipResult: (item): EnrichRunResult => ({
      name: item.name, data: {}, durationMs: 0, skipped: true,
    }),
    successResult: (item, fnResult, durationMs): EnrichRunResult => ({
      name: item.name, data: fnResult as EnrichmentResult, durationMs,
    }),
    errorResult: (item, error, durationMs): EnrichRunResult => ({
      name: item.name, data: {}, durationMs, error,
    }),
    unexpectedResult: (): EnrichRunResult => ({
      name: '?', data: {}, durationMs: 0, error: 'Unexpected rejection',
    }),
    buildSummary: (results, totalDurationMs) => {
      let errorCount = 0, skippedCount = 0;
      for (const r of results) {
        if (r.skipped) skippedCount++;
        else if (r.error) errorCount++;
      }
      return { results, totalDurationMs, errorCount, skippedCount };
    },
  });
}
