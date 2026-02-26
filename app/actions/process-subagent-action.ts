"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSubagentScopedActions } from "@/lib/evals/action-registry";
import { getSubagentScopedEvals } from "@/lib/evals/registry";
import { getSubagentScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllActions } from "@/lib/evals/action-runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSubagentFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import type { ActionRunResult } from "@/lib/evals/action-types";
import type { EvalRunResult } from "@/lib/evals/types";
import type { EnrichRunResult } from "@/lib/evals/enrich-types";

export type SubagentActionResult =
  | { ok: true; result: ActionRunResult }
  | { ok: false; error: string };

/**
 * Single-item worker for subagent actions. Mirrors process-session-action
 * but uses subagent-scoped lookup and subagent content hashing.
 */
export async function processSubagentAction(
  projectName: string,
  sessionId: string,
  agentId: string,
  actionName: string,
  forceRefresh: boolean = false,
  subagentType?: string,
  subagentDescription?: string,
): Promise<SubagentActionResult> {
  try {
    await ensureEvalsLoaded();

    const actions = getSubagentScopedActions(subagentType);
    const actionItem = actions.find(a => a.name === actionName);
    if (!actionItem) {
      return { ok: false, error: `Action "${actionName}" not found for subagent type "${subagentType ?? "any"}"` };
    }

    const sessionKey = `${sessionId}/agent-${agentId}`;
    const contentHash = await hashSubagentFile(projectName, sessionId, agentId);

    // Check per-item cache unless force refresh or cache disabled
    if (!forceRefresh && actionItem.cache && contentHash) {
      const itemCodeHash = hashItemCode(actionItem.fn);
      const cached = await getPerItemCache<ActionRunResult>(
        "actions", projectName, sessionKey, actionItem.name, itemCodeHash, contentHash,
      );
      if (cached) {
        return { ok: true, result: cached.value };
      }
    }

    // Run the single action
    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);

    // Gather cached eval/enrichment results (best-effort)
    const evalResults: Record<string, EvalRunResult> = {};
    const enrichmentResults: Record<string, EnrichRunResult> = {};
    if (contentHash) {
      const evals = getSubagentScopedEvals(subagentType);
      await Promise.all(evals.map(async (evalItem) => {
        try {
          const itemCodeHash = hashItemCode(evalItem.fn);
          const cached = await getPerItemCache<EvalRunResult>(
            "evals", projectName, sessionKey, evalItem.name, itemCodeHash, contentHash,
          );
          if (cached) evalResults[evalItem.name] = cached.value;
        } catch { /* best-effort */ }
      }));
      const enrichers = getSubagentScopedEnrichers(subagentType);
      await Promise.all(enrichers.map(async (enrichItem) => {
        try {
          const itemCodeHash = hashItemCode(enrichItem.fn);
          const cached = await getPerItemCache<EnrichRunResult>(
            "enrichments", projectName, sessionKey, enrichItem.name, itemCodeHash, contentHash,
          );
          if (cached) enrichmentResults[enrichItem.name] = cached.value;
        } catch { /* best-effort */ }
      }));
    }

    const summary = await runAllActions(
      rawLines,
      stats,
      projectName,
      sessionId,
      evalResults,
      enrichmentResults,
      [actionItem],
      {
        source: `agent-${agentId}`,
        subagentType,
        subagentDescription,
        parentSessionId: sessionId,
      },
    );

    const result = summary.results[0];
    if (!result) {
      return { ok: false, error: "No result returned from action" };
    }

    // Cache the result (if caching enabled)
    if (actionItem.cache && contentHash) {
      const itemCodeHash = hashItemCode(actionItem.fn);
      await setPerItemCache("actions", projectName, sessionKey, actionItem.name, itemCodeHash, result, contentHash);
    }

    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
