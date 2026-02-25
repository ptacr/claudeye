"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEvals } from "@/lib/evals/registry";
import { getSessionScopedEnrichers } from "@/lib/evals/enrich-registry";
import { hasAlerts } from "@/lib/evals/alert-registry";
import { fireAlerts } from "@/lib/evals/alert-dispatcher";
import { hashSessionFile, hashItemCode, getPerItemCache } from "@/lib/cache";
import type { EvalRunResult, EvalRunSummary } from "@/lib/evals/types";
import type { EnrichRunResult, EnrichRunSummary } from "@/lib/evals/enrich-types";

/**
 * Best-effort alert firing for a session.
 * Collects all cached eval + enrichment results. If every registered
 * item has a cached result, fires alerts. Otherwise no-op — the
 * background queue will fire alerts on its next pass.
 */
export async function fireSessionAlerts(
  projectName: string,
  sessionId: string,
): Promise<{ ok: boolean; fired: boolean }> {
  try {
    if (!hasAlerts()) return { ok: true, fired: false };

    await ensureEvalsLoaded();

    const contentHash = await hashSessionFile(projectName, sessionId);
    if (!contentHash) return { ok: true, fired: false };

    const evals = getSessionScopedEvals();
    const enrichers = getSessionScopedEnrichers();

    // Collect cached eval results
    const evalResults: EvalRunResult[] = [];
    for (const item of evals) {
      const itemCodeHash = hashItemCode(item.fn);
      const cached = await getPerItemCache<EvalRunResult>(
        "evals", projectName, sessionId, item.name, itemCodeHash, contentHash,
      );
      if (!cached) return { ok: true, fired: false }; // Not all done yet
      evalResults.push(cached.value);
    }

    // Collect cached enrichment results
    const enrichResults: EnrichRunResult[] = [];
    for (const item of enrichers) {
      const itemCodeHash = hashItemCode(item.fn);
      const cached = await getPerItemCache<EnrichRunResult>(
        "enrichments", projectName, sessionId, item.name, itemCodeHash, contentHash,
      );
      if (!cached) return { ok: true, fired: false }; // Not all done yet
      enrichResults.push(cached.value);
    }

    // All items have cached results — build summaries and fire
    const evalSummary: EvalRunSummary | undefined = evalResults.length > 0
      ? {
          results: evalResults,
          totalDurationMs: evalResults.reduce((sum, r) => sum + r.durationMs, 0),
          passCount: evalResults.filter(r => !r.error && !r.skipped && r.pass).length,
          failCount: evalResults.filter(r => !r.error && !r.skipped && !r.pass).length,
          errorCount: evalResults.filter(r => !!r.error).length,
          skippedCount: evalResults.filter(r => !!r.skipped).length,
        }
      : undefined;

    const enrichSummary: EnrichRunSummary | undefined = enrichResults.length > 0
      ? {
          results: enrichResults,
          totalDurationMs: enrichResults.reduce((sum, r) => sum + r.durationMs, 0),
          errorCount: enrichResults.filter(r => !!r.error).length,
          skippedCount: enrichResults.filter(r => !!r.skipped).length,
        }
      : undefined;

    await fireAlerts({
      projectName,
      sessionId,
      evalSummary,
      enrichSummary,
    });

    return { ok: true, fired: true };
  } catch (err) {
    console.error("[fire-session-alerts] Error:", err instanceof Error ? err.message : err);
    return { ok: false, fired: false };
  }
}
