/**
 * Executes all registered filter functions against a session's log entries.
 * Each filter is individually try/caught so one failure doesn't block others.
 */
import { getRegisteredFilters } from "./dashboard-registry";
import { runAll } from "./run-all";
import type { EvalContext, EvalLogStats } from "./types";
import type { FilterComputeResult, FilterComputeSummary, FilterValue, RegisteredFilter } from "./dashboard-types";

export async function runAllFilters(
  entries: Record<string, unknown>[],
  stats: EvalLogStats,
  projectName: string,
  sessionId: string,
  filtersToRun?: RegisteredFilter[],
): Promise<FilterComputeSummary> {
  const items = filtersToRun ?? getRegisteredFilters();
  const context: EvalContext = { entries, stats, projectName, sessionId, source: 'session' };

  return runAll(items, context, {
    // Skipped filters return value: false so downstream aggregation always has a value
    skipResult: (item): FilterComputeResult => ({
      name: item.name, value: false, durationMs: 0, skipped: true,
    }),
    successResult: (item, fnResult, durationMs): FilterComputeResult => ({
      name: item.name, value: fnResult as FilterValue, durationMs,
    }),
    errorResult: (item, error, durationMs): FilterComputeResult => ({
      name: item.name, value: false, durationMs, error,
    }),
    unexpectedResult: (): FilterComputeResult => ({
      name: '?', value: false, durationMs: 0, error: 'Unexpected rejection',
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
