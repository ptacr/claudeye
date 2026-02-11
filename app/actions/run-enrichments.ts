"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedResult, setCachedResult } from "@/lib/cache";
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
  try {
    await ensureEvalsLoaded();

    const sessionEnrichers = getSessionScopedEnrichers();
    if (sessionEnrichers.length === 0) {
      return { ok: true, hasEnrichers: false };
    }

    const registeredNames = sessionEnrichers.map((e) => e.name);

    // Check cache unless force refresh requested
    if (!forceRefresh) {
      const cached = await getCachedResult<EnrichRunSummary>(
        "enrichments",
        projectName,
        sessionId,
        registeredNames,
      );
      if (cached) {
        return { ok: true, summary: cached.value, hasEnrichers: true, cached: true };
      }
    }

    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);
    const summary = await runAllEnrichers(rawLines, stats, projectName, sessionId, sessionEnrichers, { scope: 'session' });

    // Store in cache (fire-and-forget)
    setCachedResult("enrichments", projectName, sessionId, summary, registeredNames);

    return { ok: true, summary, hasEnrichers: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
