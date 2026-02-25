"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSessionFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import type { EnrichRunResult } from "@/lib/evals/enrich-types";

export type SessionEnrichmentResult =
  | { ok: true; result: EnrichRunResult }
  | { ok: false; error: string };

/**
 * Server action that processes a single session-scoped enricher by name.
 * Checks per-item cache first, runs only if uncached (or forceRefresh).
 */
export async function processSessionEnrichment(
  projectName: string,
  sessionId: string,
  enricherName: string,
  forceRefresh: boolean = false,
): Promise<SessionEnrichmentResult> {
  try {
    await ensureEvalsLoaded();

    const enrichers = getSessionScopedEnrichers();
    const enrichItem = enrichers.find(e => e.name === enricherName);
    if (!enrichItem) {
      return { ok: false, error: `Enricher "${enricherName}" not found` };
    }

    const contentHash = await hashSessionFile(projectName, sessionId);

    // Check per-item cache unless force refresh
    if (!forceRefresh && contentHash) {
      const itemCodeHash = hashItemCode(enrichItem.fn);
      const cached = await getPerItemCache<EnrichRunResult>(
        "enrichments", projectName, sessionId, enrichItem.name, itemCodeHash, contentHash,
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
      { source: "session" },
    );

    const result = summary.results[0];
    if (!result) {
      return { ok: false, error: "No result returned from enricher" };
    }

    // Cache the result
    if (contentHash) {
      const itemCodeHash = hashItemCode(enrichItem.fn);
      await setPerItemCache("enrichments", projectName, sessionId, enrichItem.name, itemCodeHash, result, contentHash);
    }

    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
