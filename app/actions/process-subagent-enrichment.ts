"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSubagentScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSubagentFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import type { EnrichRunResult } from "@/lib/evals/enrich-types";

export type SubagentEnrichmentResult =
  | { ok: true; result: EnrichRunResult }
  | { ok: false; error: string };

/**
 * Single-item worker for subagent enrichments. Mirrors process-session-enrichment
 * but uses subagent-scoped enricher lookup and subagent content hashing.
 */
export async function processSubagentEnrichment(
  projectName: string,
  sessionId: string,
  agentId: string,
  enricherName: string,
  forceRefresh: boolean = false,
  subagentType?: string,
  subagentDescription?: string,
): Promise<SubagentEnrichmentResult> {
  try {
    await ensureEvalsLoaded();

    const enrichers = getSubagentScopedEnrichers(subagentType);
    const enrichItem = enrichers.find(e => e.name === enricherName);
    if (!enrichItem) {
      return { ok: false, error: `Enricher "${enricherName}" not found for subagent type "${subagentType ?? "any"}"` };
    }

    const sessionKey = `${sessionId}/agent-${agentId}`;
    const contentHash = await hashSubagentFile(projectName, sessionId, agentId);

    // Check per-item cache unless force refresh
    if (!forceRefresh && contentHash) {
      const itemCodeHash = hashItemCode(enrichItem.fn);
      const cached = await getPerItemCache<EnrichRunResult>(
        "enrichments", projectName, sessionKey, enrichItem.name, itemCodeHash, contentHash,
      );
      if (cached) {
        return { ok: true, result: cached.value };
      }
    }

    // Run the single enricher
    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);

    const summary = await runAllEnrichers(
      rawLines,
      stats,
      projectName,
      sessionId,
      [enrichItem],
      {
        source: `agent-${agentId}`,
        subagentType,
        subagentDescription,
        parentSessionId: sessionId,
      },
    );

    const result = summary.results[0];
    if (!result) {
      return { ok: false, error: "No result returned from enricher" };
    }

    // Cache the result
    if (contentHash) {
      const itemCodeHash = hashItemCode(enrichItem.fn);
      await setPerItemCache("enrichments", projectName, sessionKey, enrichItem.name, itemCodeHash, result, contentHash);
    }

    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
