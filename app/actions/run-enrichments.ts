"use server";

import { getSessionScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import { runSessionAction } from "./run-session-action";
import type { EnrichRunSummary } from "@/lib/evals/enrich-types";

export type EnrichActionResult =
  | { ok: true; summary: EnrichRunSummary; hasEnrichers: true; cached: boolean }
  | { ok: true; hasEnrichers: false }
  | { ok: false; error: string };

/**
 * Server action that loads enrichers (if configured), runs them against a session's
 * log entries, and returns serializable results to the client.
 */
export async function runEnrichments(
  projectName: string,
  sessionId: string,
  forceRefresh: boolean = false,
): Promise<EnrichActionResult> {
  const result = await runSessionAction<EnrichRunSummary>({
    kind: "enrichments",
    projectName,
    sessionId,
    forceRefresh,
    getItems: getSessionScopedEnrichers,
    run: (rawLines, stats, items) =>
      runAllEnrichers(rawLines, stats, projectName, sessionId, items as any, { source: 'session' }),
  });

  if (!result.ok) return result;
  if (!result.hasItems) return { ok: true, hasEnrichers: false };
  return { ok: true, summary: result.summary, hasEnrichers: true, cached: result.cached };
}
