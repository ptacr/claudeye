"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEnrichers, getSubagentScopedEnrichers } from "@/lib/evals/enrich-registry";
import { hashSessionFile, hashSubagentFile, hashItemCode, getPerItemCache } from "@/lib/cache";
import type { EnrichRunResult } from "@/lib/evals/enrich-types";

export type EnrichmentCacheProbeResult =
  | { ok: true; hasEnrichers: true; names: string[]; cachedResults: EnrichRunResult[]; uncachedNames: string[] }
  | { ok: true; hasEnrichers: false }
  | { ok: false; error: string };

export async function checkEnrichmentCacheAndList(
  projectName: string,
  sessionId: string,
  agentId?: string,
  subagentType?: string,
): Promise<EnrichmentCacheProbeResult> {
  try {
    await ensureEvalsLoaded();

    const items = agentId
      ? getSubagentScopedEnrichers(subagentType)
      : getSessionScopedEnrichers();

    if (items.length === 0) return { ok: true, hasEnrichers: false };

    const names = items.map(i => i.name);
    const sessionKey = agentId ? `${sessionId}/agent-${agentId}` : sessionId;
    const contentHash = agentId
      ? await hashSubagentFile(projectName, sessionId, agentId)
      : await hashSessionFile(projectName, sessionId);

    if (!contentHash) {
      return { ok: true, hasEnrichers: true, names, cachedResults: [], uncachedNames: names };
    }

    const cachedResults: EnrichRunResult[] = [];
    const uncachedNames: string[] = [];

    await Promise.all(items.map(async (item) => {
      const itemCodeHash = hashItemCode(item.fn);
      const cached = await getPerItemCache<EnrichRunResult>(
        "enrichments", projectName, sessionKey, item.name, itemCodeHash, contentHash,
      );
      if (cached) cachedResults.push(cached.value);
      else uncachedNames.push(item.name);
    }));

    return { ok: true, hasEnrichers: true, names, cachedResults, uncachedNames };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
