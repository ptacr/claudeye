"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSubagentScopedEvals } from "@/lib/evals/registry";
import { runAllEvals } from "@/lib/evals/runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSubagentFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import type { EvalRunResult } from "@/lib/evals/types";

export type SubagentEvalResult =
  | { ok: true; result: EvalRunResult }
  | { ok: false; error: string };

/**
 * Single-item worker for subagent evals. Mirrors process-session-eval but
 * uses subagent-scoped eval lookup and subagent content hashing.
 */
export async function processSubagentEval(
  projectName: string,
  sessionId: string,
  agentId: string,
  evalName: string,
  forceRefresh: boolean = false,
  subagentType?: string,
  subagentDescription?: string,
): Promise<SubagentEvalResult> {
  try {
    await ensureEvalsLoaded();

    const evals = getSubagentScopedEvals(subagentType);
    const evalItem = evals.find(e => e.name === evalName);
    if (!evalItem) {
      return { ok: false, error: `Eval "${evalName}" not found for subagent type "${subagentType ?? "any"}"` };
    }

    const sessionKey = `${sessionId}/agent-${agentId}`;
    const contentHash = await hashSubagentFile(projectName, sessionId, agentId);

    // Check per-item cache unless force refresh
    if (!forceRefresh && contentHash) {
      const itemCodeHash = hashItemCode(evalItem.fn);
      const cached = await getPerItemCache<EvalRunResult>(
        "evals", projectName, sessionKey, evalItem.name, itemCodeHash, contentHash,
      );
      if (cached) {
        return { ok: true, result: cached.value };
      }
    }

    // Run the single eval
    const { entries, rawLines } = await getCachedSessionLog(projectName, sessionId);
    const stats = calculateLogStats(entries);

    const summary = await runAllEvals(
      rawLines,
      stats,
      projectName,
      sessionId,
      [evalItem],
      {
        source: `agent-${agentId}`,
        subagentType,
        subagentDescription,
        parentSessionId: sessionId,
      },
    );

    const result = summary.results[0];
    if (!result) {
      return { ok: false, error: "No result returned from eval" };
    }

    // Cache the result
    if (contentHash) {
      const itemCodeHash = hashItemCode(evalItem.fn);
      await setPerItemCache("evals", projectName, sessionKey, evalItem.name, itemCodeHash, result, contentHash);
    }

    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
