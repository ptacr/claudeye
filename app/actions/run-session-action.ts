/**
 * Shared helper for the session-level eval and enrichment server actions.
 *
 * Both run-evals.ts and run-enrichments.ts follow an identical pattern:
 *   1. ensureEvalsLoaded()
 *   2. Get registry items → early return if empty
 *   3. Check cache → return if hit
 *   4. Load session log + calculate stats
 *   5. Call runner function
 *   6. Store in cache (fire-and-forget)
 *   7. Return result
 *
 * This helper extracts that boilerplate so each action file only needs to
 * specify the domain-specific pieces (kind, getItems, run).
 */
import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedResult, setCachedResult } from "@/lib/cache";
import type { EvalLogStats } from "@/lib/evals/types";

export async function runSessionAction<TSummary>(opts: {
  kind: string;
  projectName: string;
  sessionId: string;
  forceRefresh: boolean;
  getItems: () => { name: string }[];
  run: (rawLines: Record<string, unknown>[], stats: EvalLogStats, items: { name: string }[]) => Promise<TSummary>;
}): Promise<
  | { ok: true; summary: TSummary; hasItems: true; cached: boolean }
  | { ok: true; hasItems: false }
  | { ok: false; error: string }
> {
  try {
    await ensureEvalsLoaded();

    const items = opts.getItems();
    if (items.length === 0) {
      return { ok: true, hasItems: false };
    }

    const registeredNames = items.map((e) => e.name);

    // Check cache unless force refresh requested
    if (!opts.forceRefresh) {
      const cached = await getCachedResult<TSummary>(
        opts.kind,
        opts.projectName,
        opts.sessionId,
        registeredNames,
      );
      if (cached) {
        return { ok: true, summary: cached.value, hasItems: true, cached: true };
      }
    }

    const { entries, rawLines } = await getCachedSessionLog(opts.projectName, opts.sessionId);
    const stats = calculateLogStats(entries);
    const summary = await opts.run(rawLines, stats, items);

    // Store in cache (fire-and-forget)
    setCachedResult(opts.kind, opts.projectName, opts.sessionId, summary, registeredNames);

    return { ok: true, summary, hasItems: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
