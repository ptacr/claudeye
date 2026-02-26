"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedActions, getSubagentScopedActions } from "@/lib/evals/action-registry";
import { hashSessionFile, hashSubagentFile, hashItemCode, getPerItemCache } from "@/lib/cache";
import type { ActionRunResult } from "@/lib/evals/action-types";

export type ActionCacheProbeResult =
  | { ok: true; hasActions: true; names: string[]; cachedResults: ActionRunResult[]; uncachedNames: string[] }
  | { ok: true; hasActions: false }
  | { ok: false; error: string };

export async function checkActionCacheAndList(
  projectName: string,
  sessionId: string,
  agentId?: string,
  subagentType?: string,
): Promise<ActionCacheProbeResult> {
  try {
    await ensureEvalsLoaded();

    const items = agentId
      ? getSubagentScopedActions(subagentType)
      : getSessionScopedActions();

    if (items.length === 0) return { ok: true, hasActions: false };

    const names = items.map(i => i.name);
    const sessionKey = agentId ? `${sessionId}/agent-${agentId}` : sessionId;
    const contentHash = agentId
      ? await hashSubagentFile(projectName, sessionId, agentId)
      : await hashSessionFile(projectName, sessionId);

    if (!contentHash) {
      return { ok: true, hasActions: true, names, cachedResults: [], uncachedNames: names };
    }

    const probeResults = await Promise.all(items.map(async (item) => {
      // Actions with cache: false are always uncached
      if (!item.cache) {
        return { name: item.name, cached: null as ActionRunResult | null };
      }
      const itemCodeHash = hashItemCode(item.fn);
      const cached = await getPerItemCache<ActionRunResult>(
        "actions", projectName, sessionKey, item.name, itemCodeHash, contentHash,
      );
      return { name: item.name, cached: cached ? cached.value : null };
    }));

    const cachedResults: ActionRunResult[] = [];
    const uncachedNames: string[] = [];
    for (const probe of probeResults) {
      if (probe.cached) cachedResults.push(probe.cached);
      else uncachedNames.push(probe.name);
    }

    return { ok: true, hasActions: true, names, cachedResults, uncachedNames };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
