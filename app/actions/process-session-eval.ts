"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEvals } from "@/lib/evals/registry";
import { runAllEvals } from "@/lib/evals/runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSessionFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import type { EvalRunResult } from "@/lib/evals/types";

export type SessionEvalResult =
  | { ok: true; result: EvalRunResult }
  | { ok: false; error: string };

/**
 * Server action that processes a single session-scoped eval by name.
 * Checks per-item cache first, runs only if uncached (or forceRefresh).
 */
export async function processSessionEval(
  projectName: string,
  sessionId: string,
  evalName: string,
  forceRefresh: boolean = false,
): Promise<SessionEvalResult> {
  try {
    await ensureEvalsLoaded();

    const evals = getSessionScopedEvals();
    const evalItem = evals.find(e => e.name === evalName);
    if (!evalItem) {
      return { ok: false, error: `Eval "${evalName}" not found` };
    }

    const contentHash = await hashSessionFile(projectName, sessionId);

    // Check per-item cache unless force refresh
    if (!forceRefresh && contentHash) {
      const itemCodeHash = hashItemCode(evalItem.fn);
      const cached = await getPerItemCache<EvalRunResult>(
        "evals", projectName, sessionId, evalItem.name, itemCodeHash, contentHash,
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
      { source: "session" },
    );

    const result = summary.results[0];
    if (!result) {
      return { ok: false, error: "No result returned from eval" };
    }

    // Cache the result
    if (contentHash) {
      const itemCodeHash = hashItemCode(evalItem.fn);
      await setPerItemCache("evals", projectName, sessionId, evalItem.name, itemCodeHash, result, contentHash);
    }

    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
