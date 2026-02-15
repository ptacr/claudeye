/**
 * Shared helper for the session-level eval and enrichment server actions.
 *
 * Uses per-item caching: each eval/enricher result is cached independently
 * so that adding a new item only runs the new one — existing unchanged items
 * load from cache.
 */
import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { hashSessionFile, hashItemCode, getPerItemCache, setPerItemCache } from "@/lib/cache";
import type { EvalLogStats } from "@/lib/evals/types";

interface RunnableItem {
  name: string;
  fn: Function;
}

interface ItemResult {
  name: string;
}

export async function runSessionAction<TItem extends RunnableItem, TResult extends ItemResult, TSummary>(opts: {
  kind: string;
  projectName: string;
  sessionId: string;
  forceRefresh: boolean;
  getItems: () => TItem[];
  run: (rawLines: Record<string, unknown>[], stats: EvalLogStats, items: TItem[]) => Promise<TSummary>;
  buildSummary: (results: TResult[], totalDurationMs: number) => TSummary;
  extractResults: (summary: TSummary) => TResult[];
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

    // Compute content hash once for the session
    const contentHash = await hashSessionFile(opts.projectName, opts.sessionId);

    // Per-item cache lookup
    const cachedResults: TResult[] = [];
    const uncachedItems: TItem[] = [];

    if (!opts.forceRefresh) {
      await Promise.all(items.map(async (item) => {
        const itemCodeHash = hashItemCode(item.fn);
        const cached = await getPerItemCache<TResult>(
          opts.kind,
          opts.projectName,
          opts.sessionId,
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
      uncachedItems.push(...items);
    }

    // All items cached — rebuild summary from cached results
    if (uncachedItems.length === 0) {
      const summary = opts.buildSummary(cachedResults, 0);
      return { ok: true, summary, hasItems: true, cached: true };
    }

    // Some items need running — load session data once
    const { entries, rawLines } = await getCachedSessionLog(opts.projectName, opts.sessionId);
    const stats = calculateLogStats(entries);
    const freshSummary = await opts.run(rawLines, stats, uncachedItems);
    const freshResults = opts.extractResults(freshSummary);

    // Store each fresh result in per-item cache (fire-and-forget)
    for (const result of freshResults) {
      const item = uncachedItems.find(i => i.name === result.name);
      if (item) {
        const itemCodeHash = hashItemCode(item.fn);
        setPerItemCache(opts.kind, opts.projectName, opts.sessionId, item.name, itemCodeHash, result, contentHash);
      }
    }

    // Merge cached + fresh results and rebuild summary
    const allResults = [...cachedResults, ...freshResults];
    const totalDurationMs = freshResults.reduce((sum, r: any) => sum + (r.durationMs || 0), 0);
    const summary = opts.buildSummary(allResults, totalDurationMs);

    return { ok: true, summary, hasItems: true, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
