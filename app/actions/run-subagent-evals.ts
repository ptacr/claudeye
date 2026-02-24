"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSubagentScopedEvals } from "@/lib/evals/registry";
import { runAllEvals } from "@/lib/evals/runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSubagentFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import { batchAll } from "@/lib/concurrency";
import type { EvalRunSummary, EvalRunResult } from "@/lib/evals/types";

export type SubagentEvalActionResult =
  | { ok: true; summary: EvalRunSummary; hasEvals: true; cached: boolean }
  | { ok: true; hasEvals: false }
  | { ok: false; error: string };

function buildEvalSummary(results: EvalRunResult[], totalDurationMs: number): EvalRunSummary {
  let passCount = 0, failCount = 0, errorCount = 0, skippedCount = 0;
  for (const r of results) {
    if (r.skipped) skippedCount++;
    else if (r.error) errorCount++;
    else if (r.pass) passCount++;
    else failCount++;
  }
  return { results, totalDurationMs, passCount, failCount, errorCount, skippedCount };
}

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
  evalName?: string,
): Promise<SubagentEvalActionResult> {
  try {
    await ensureEvalsLoaded();

    let subagentEvals = getSubagentScopedEvals(subagentType);
    if (subagentEvals.length === 0) {
      return { ok: true, hasEvals: false };
    }

    // Filter to a single eval when evalName is provided
    if (evalName) {
      const filtered = subagentEvals.filter(e => e.name === evalName);
      if (filtered.length === 0) {
        return { ok: false, error: `Eval "${evalName}" not found` };
      }
      subagentEvals = filtered;
    }

    const sessionKey = `${sessionId}/agent-${agentId}`;
    const contentHash = await hashSubagentFile(projectName, sessionId, agentId);

    // Per-item cache lookup
    const cachedResults: EvalRunResult[] = [];
    const uncachedItems: typeof subagentEvals = [];

    if (!forceRefresh && !evalName && contentHash) {
      await Promise.all(subagentEvals.map(async (item) => {
        const itemCodeHash = hashItemCode(item.fn);
        const cached = await getPerItemCache<EvalRunResult>(
          "evals",
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
      uncachedItems.push(...subagentEvals);
    }

    // All items cached — rebuild summary
    if (uncachedItems.length === 0) {
      const summary = buildEvalSummary(cachedResults, 0);
      return { ok: true, summary, hasEvals: true, cached: true };
    }

    // Some items need running — load session data once
    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);

    const freshSummary = await runAllEvals(
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
          await setPerItemCache("evals", projectName, sessionKey, item.name, itemCodeHash, result, contentHash);
        }
      }), 10);
    }

    // Merge cached + fresh results and rebuild summary
    const allResults = [...cachedResults, ...freshSummary.results];
    const totalDurationMs = freshSummary.results.reduce((sum, r) => sum + (r.durationMs || 0), 0);
    const summary = buildEvalSummary(allResults, totalDurationMs);

    return { ok: true, summary, hasEvals: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
