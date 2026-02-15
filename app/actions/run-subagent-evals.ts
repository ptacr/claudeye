"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSubagentScopedEvals } from "@/lib/evals/registry";
import { runAllEvals } from "@/lib/evals/runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedResult, setCachedResult, hashSubagentFile } from "@/lib/cache";
import type { EvalRunSummary } from "@/lib/evals/types";

export type SubagentEvalActionResult =
  | { ok: true; summary: EvalRunSummary; hasEvals: true; cached: boolean }
  | { ok: true; hasEvals: false }
  | { ok: false; error: string };

/**
 * Server action that runs subagent-scoped evals against a subagent's log entries.
 */
export async function runSubagentEvals(
  projectName: string,
  sessionId: string,
  agentId: string,
  subagentType?: string,
  subagentDescription?: string,
  forceRefresh: boolean = false,
): Promise<SubagentEvalActionResult> {
  try {
    await ensureEvalsLoaded();

    const subagentEvals = getSubagentScopedEvals(subagentType);
    if (subagentEvals.length === 0) {
      return { ok: true, hasEvals: false };
    }

    const registeredNames = subagentEvals.map((e) => e.name);
    const sessionKey = `${sessionId}/agent-${agentId}`;
    const contentHash = await hashSubagentFile(projectName, sessionId, agentId);

    // Check cache unless force refresh requested
    if (!forceRefresh && contentHash) {
      const cached = await getCachedResult<EvalRunSummary>(
        "evals",
        projectName,
        sessionKey,
        registeredNames,
        contentHash,
      );
      if (cached) {
        return { ok: true, summary: cached.value, hasEvals: true, cached: true };
      }
    }

    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);

    const summary = await runAllEvals(
      rawLines,
      stats,
      projectName,
      sessionId,
      subagentEvals,
      {
        source: `agent-${agentId}`,
        subagentType,
        subagentDescription,
        parentSessionId: sessionId,
      },
    );

    // Store in cache (fire-and-forget)
    if (contentHash) {
      setCachedResult("evals", projectName, sessionKey, summary, registeredNames, contentHash);
    }

    return { ok: true, summary, hasEvals: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
