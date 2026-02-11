"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSubagentScopedEnrichers } from "@/lib/evals/enrich-registry";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import { loadSubagentLog } from "@/app/actions/load-subagent-log";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedResult, setCachedResult, hashSubagentFile } from "@/lib/cache";
import type { EnrichRunSummary } from "@/lib/evals/enrich-types";

export type SubagentEnrichActionResult =
  | { ok: true; summary: EnrichRunSummary; hasEnrichers: true; cached: boolean }
  | { ok: true; hasEnrichers: false }
  | { ok: false; error: string };

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

    const registeredNames = subagentEnrichers.map((e) => e.name);
    const sessionKey = `${sessionId}/agent-${agentId}`;
    const contentHash = await hashSubagentFile(projectName, sessionId, agentId);

    // Check cache unless force refresh requested
    if (!forceRefresh && contentHash) {
      const cached = await getCachedResult<EnrichRunSummary>(
        "enrichments",
        projectName,
        sessionKey,
        registeredNames,
        contentHash,
      );
      if (cached) {
        return { ok: true, summary: cached.value, hasEnrichers: true, cached: true };
      }
    }

    const logResult = await loadSubagentLog(projectName, sessionId, agentId);
    if (!logResult.ok) {
      return { ok: false, error: logResult.error };
    }

    const entries = logResult.entries;
    const rawLines = logResult.rawLines;
    const stats = calculateLogStats(entries);

    const summary = await runAllEnrichers(
      rawLines,
      stats,
      projectName,
      sessionId,
      subagentEnrichers,
      {
        scope: 'subagent',
        subagentId: agentId,
        subagentType,
        subagentDescription,
        parentSessionId: sessionId,
      },
    );

    // Store in cache (fire-and-forget)
    if (contentHash) {
      setCachedResult("enrichments", projectName, sessionKey, summary, registeredNames, contentHash);
    }

    return { ok: true, summary, hasEnrichers: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
