"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEvals, getSubagentScopedEvals } from "@/lib/evals/registry";
import { hashSessionFile, hashSubagentFile, hashItemCode, getPerItemCache } from "@/lib/cache";
import type { EvalRunResult } from "@/lib/evals/types";

export type EvalCacheProbeResult =
  | { ok: true; hasEvals: true; names: string[]; cachedResults: EvalRunResult[]; uncachedNames: string[] }
  | { ok: true; hasEvals: false }
  | { ok: false; error: string };

export async function checkEvalCacheAndList(
  projectName: string,
  sessionId: string,
  agentId?: string,
  subagentType?: string,
): Promise<EvalCacheProbeResult> {
  try {
    await ensureEvalsLoaded();

    const items = agentId
      ? getSubagentScopedEvals(subagentType)
      : getSessionScopedEvals();

    if (items.length === 0) return { ok: true, hasEvals: false };

    const names = items.map(i => i.name);
    const sessionKey = agentId ? `${sessionId}/agent-${agentId}` : sessionId;
    const contentHash = agentId
      ? await hashSubagentFile(projectName, sessionId, agentId)
      : await hashSessionFile(projectName, sessionId);

    if (!contentHash) {
      return { ok: true, hasEvals: true, names, cachedResults: [], uncachedNames: names };
    }

    const cachedResults: EvalRunResult[] = [];
    const uncachedNames: string[] = [];

    await Promise.all(items.map(async (item) => {
      const itemCodeHash = hashItemCode(item.fn);
      const cached = await getPerItemCache<EvalRunResult>(
        "evals", projectName, sessionKey, item.name, itemCodeHash, contentHash,
      );
      if (cached) cachedResults.push(cached.value);
      else uncachedNames.push(item.name);
    }));

    return { ok: true, hasEvals: true, names, cachedResults, uncachedNames };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
