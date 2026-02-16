"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSubagentScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSubagentFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import { batchAll } from "@/lib/concurrency";
import type { EnrichRunSummary, EnrichRunResult } from "@/lib/evals/enrich-types";

export type SubagentEnrichActionResult =
  | { ok: true; summary: EnrichRunSummary; hasEnrichers: true; cached: boolean }
  | { ok: true; hasEnrichers: false }
  | { ok: false; error: string };

function buildEnrichSummary(results: EnrichRunResult[], totalDurationMs: number): EnrichRunSummary {
  let errorCount = 0, skippedCount = 0;
  for (const r of results) {
    if (r.skipped) skippedCount++;
    else if (r.error) errorCount++;
  }
  return { results, totalDurationMs, errorCount, skippedCount };
}

/**
 * Server action that runs subagent-scoped enrichers against a subagent's log entries.
 */
export async function runSubagentEnrichments(
  projectName: string,
  sessionId: string,
  agentId: string,
  subagentType?: string,
  subagentDescription?: string,
  forceRefresh: boolean = false,
): Promise<SubagentEnrichActionResult> {
  try {
    await ensureEvalsLoaded();

    const subagentEnrichers = getSubagentScopedEnrichers(subagentType);
    if (subagentEnrichers.length === 0) {
      return { ok: true, hasEnrichers: false };
    }

    const sessionKey = `${sessionId}/agent-${agentId}`;
    const contentHash = await hashSubagentFile(projectName, sessionId, agentId);

    // Per-item cache lookup
    const cachedResults: EnrichRunResult[] = [];
    const uncachedItems: typeof subagentEnrichers = [];

    if (!forceRefresh && contentHash) {
      await Promise.all(subagentEnrichers.map(async (item) => {
        const itemCodeHash = hashItemCode(item.fn);
        const cached = await getPerItemCache<EnrichRunResult>(
          "enrichments",
          projectName,
          sessionKey,
          item.name,
          itemCodeHash,
          contentHash,
        );
        if (cached) {
          cachedResults.push(cached.value);
        } else {
          uncachedItems.push(item);
        }
      }));
    } else {
      uncachedItems.push(...subagentEnrichers);
    }

    // All items cached — rebuild summary
    if (uncachedItems.length === 0) {
      const summary = buildEnrichSummary(cachedResults, 0);
      return { ok: true, summary, hasEnrichers: true, cached: true };
    }

    // Some items need running — load session data once
    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);

    const freshSummary = await runAllEnrichers(
      rawLines,
      stats,
      projectName,
      sessionId,
      uncachedItems,
      {
        source: `agent-${agentId}`,
        subagentType,
        subagentDescription,
        parentSessionId: sessionId,
      },
    );

    // Store each fresh result in per-item cache (concurrency-limited)
    if (contentHash) {
      await batchAll(freshSummary.results.map((result) => async () => {
        const item = uncachedItems.find(i => i.name === result.name);
        if (item) {
          const itemCodeHash = hashItemCode(item.fn);
          await setPerItemCache("enrichments", projectName, sessionKey, item.name, itemCodeHash, result, contentHash);
        }
      }), 10);
    }

    // Merge cached + fresh results and rebuild summary
    const allResults = [...cachedResults, ...freshSummary.results];
    const totalDurationMs = freshSummary.results.reduce((sum, r) => sum + (r.durationMs || 0), 0);
    const summary = buildEnrichSummary(allResults, totalDurationMs);

    return { ok: true, summary, hasEnrichers: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
