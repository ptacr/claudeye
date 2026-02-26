"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedActions } from "@/lib/evals/action-registry";
import { getSessionScopedEvals } from "@/lib/evals/registry";
import { getSessionScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllActions } from "@/lib/evals/action-runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSessionFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import type { ActionRunResult } from "@/lib/evals/action-types";
import type { EvalRunResult } from "@/lib/evals/types";
import type { EnrichRunResult } from "@/lib/evals/enrich-types";

export type SessionActionResult =
  | { ok: true; result: ActionRunResult }
  | { ok: false; error: string };

/**
 * Gather cached eval results for a session (best-effort, read-only).
 */
async function gatherEvalResults(
  projectName: string,
  sessionId: string,
  contentHash: string | undefined,
): Promise<Record<string, EvalRunResult>> {
  const results: Record<string, EvalRunResult> = {};
  if (!contentHash) return results;

  const evals = getSessionScopedEvals();
  await Promise.all(evals.map(async (evalItem) => {
    try {
      const itemCodeHash = hashItemCode(evalItem.fn);
      const cached = await getPerItemCache<EvalRunResult>(
        "evals", projectName, sessionId, evalItem.name, itemCodeHash, contentHash,
      );
      if (cached) results[evalItem.name] = cached.value;
    } catch { /* best-effort */ }
  }));
  return results;
}

/**
 * Gather cached enrichment results for a session (best-effort, read-only).
 */
async function gatherEnrichmentResults(
  projectName: string,
  sessionId: string,
  contentHash: string | undefined,
): Promise<Record<string, EnrichRunResult>> {
  const results: Record<string, EnrichRunResult> = {};
  if (!contentHash) return results;

  const enrichers = getSessionScopedEnrichers();
  await Promise.all(enrichers.map(async (enrichItem) => {
    try {
      const itemCodeHash = hashItemCode(enrichItem.fn);
      const cached = await getPerItemCache<EnrichRunResult>(
        "enrichments", projectName, sessionId, enrichItem.name, itemCodeHash, contentHash,
      );
      if (cached) results[enrichItem.name] = cached.value;
    } catch { /* best-effort */ }
  }));
  return results;
}

/**
 * Server action that processes a single session-scoped action by name.
 * Checks per-item cache first, runs only if uncached (or forceRefresh).
 */
export async function processSessionAction(
  projectName: string,
  sessionId: string,
  actionName: string,
  forceRefresh: boolean = false,
): Promise<SessionActionResult> {
  try {
    await ensureEvalsLoaded();

    const actions = getSessionScopedActions();
    const actionItem = actions.find(a => a.name === actionName);
    if (!actionItem) {
      return { ok: false, error: `Action "${actionName}" not found` };
    }

    const contentHash = await hashSessionFile(projectName, sessionId);
    const itemCodeHash = actionItem.cache ? hashItemCode(actionItem.fn) : undefined;

    // Check per-item cache unless force refresh or cache disabled
    if (!forceRefresh && actionItem.cache && contentHash && itemCodeHash) {
      const cached = await getPerItemCache<ActionRunResult>(
        "actions", projectName, sessionId, actionItem.name, itemCodeHash, contentHash,
      );
      if (cached) {
        return { ok: true, result: cached.value };
      }
    }

    // Run the single action
    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);

    // Gather cached eval/enrichment results for ActionContext
    const [evalResults, enrichmentResults] = await Promise.all([
      gatherEvalResults(projectName, sessionId, contentHash),
      gatherEnrichmentResults(projectName, sessionId, contentHash),
    ]);

    const summary = await runAllActions(
      rawLines,
      stats,
      projectName,
      sessionId,
      evalResults,
      enrichmentResults,
      [actionItem],
      { source: "session" },
    );

    const result = summary.results[0];
    if (!result) {
      return { ok: false, error: "No result returned from action" };
    }

    // Cache the result (if caching enabled) — non-fatal if write fails
    if (actionItem.cache && contentHash && itemCodeHash) {
      try {
        await setPerItemCache("actions", projectName, sessionId, actionItem.name, itemCodeHash, result, contentHash);
      } catch { /* cache write is best-effort */ }
    }

    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
