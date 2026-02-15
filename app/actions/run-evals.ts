"use server";

import { getSessionScopedEvals } from "@/lib/evals/registry";
import { runAllEvals } from "@/lib/evals/runner";
import { runSessionAction } from "./run-session-action";
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
  const result = await runSessionAction<EvalRunSummary>({
    kind: "evals",
    projectName,
    sessionId,
    forceRefresh,
    getItems: getSessionScopedEvals,
    run: (rawLines, stats, items) =>
      runAllEvals(rawLines, stats, projectName, sessionId, items as any, { source: 'session' }),
  });

  if (!result.ok) return result;
  if (!result.hasItems) return { ok: true, hasEvals: false };
  return { ok: true, summary: result.summary, hasEvals: true, cached: result.cached };
}
