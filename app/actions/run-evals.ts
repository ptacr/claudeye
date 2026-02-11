"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEvals } from "@/lib/evals/registry";
import { runAllEvals } from "@/lib/evals/runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedResult, setCachedResult } from "@/lib/cache";
import type { EvalRunSummary } from "@/lib/evals/types";

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
  try {
    await ensureEvalsLoaded();

    const sessionEvals = getSessionScopedEvals();
    if (sessionEvals.length === 0) {
      return { ok: true, hasEvals: false };
    }

    const registeredNames = sessionEvals.map((e) => e.name);

    // Check cache unless force refresh requested
    if (!forceRefresh) {
      const cached = await getCachedResult<EvalRunSummary>(
        "evals",
        projectName,
        sessionId,
        registeredNames,
      );
      if (cached) {
        return { ok: true, summary: cached.value, hasEvals: true, cached: true };
      }
    }

    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);
    const summary = await runAllEvals(rawLines, stats, projectName, sessionId, sessionEvals, { scope: 'session' });

    // Store in cache (fire-and-forget)
    setCachedResult("evals", projectName, sessionId, summary, registeredNames);

    return { ok: true, summary, hasEvals: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
