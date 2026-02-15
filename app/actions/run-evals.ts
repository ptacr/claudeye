"use server";

import { getSessionScopedEvals } from "@/lib/evals/registry";
import { runAllEvals } from "@/lib/evals/runner";
import { runSessionAction } from "./run-session-action";
import type { EvalRunSummary, EvalRunResult } from "@/lib/evals/types";

export type EvalActionResult =
  | { ok: true; summary: EvalRunSummary; hasEvals: true; cached: boolean }
  | { ok: true; hasEvals: false }
  | { ok: false; error: string };

/**
 * Server action that loads evals (if configured), runs them against a session's
 * log entries, and returns serializable results to the client.
 */
export async function runEvals(
  projectName: string,
  sessionId: string,
  forceRefresh: boolean = false,
): Promise<EvalActionResult> {
  const result = await runSessionAction<any, EvalRunResult, EvalRunSummary>({
    kind: "evals",
    projectName,
    sessionId,
    forceRefresh,
    getItems: getSessionScopedEvals,
    run: (rawLines, stats, items) =>
      runAllEvals(rawLines, stats, projectName, sessionId, items as any, { source: 'session' }),
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
    extractResults: (summary) => summary.results,
  });

  if (!result.ok) return result;
  if (!result.hasItems) return { ok: true, hasEvals: false };
  return { ok: true, summary: result.summary, hasEvals: true, cached: result.cached };
}
