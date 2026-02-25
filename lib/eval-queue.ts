/**
 * Unified priority queue for all eval/enrichment processing.
 *
 * Every individual eval and enrichment — whether triggered by the background
 * scanner, the UI, or subagent processing — passes through this single queue
 * with bounded concurrency and priority ordering.
 *
 * Queue state lives in globalThis to survive Next.js hot reloading.
 */
import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getSessionScopedEvals, hasEvals } from "@/lib/evals/registry";
import { getSessionScopedEnrichers, hasEnrichers } from "@/lib/evals/enrich-registry";
import { hasAlerts } from "@/lib/evals/alert-registry";
import { fireAlerts } from "@/lib/evals/alert-dispatcher";
import { hashSessionFile, hashItemCode, getPerItemCache } from "@/lib/cache";
import { getCachedProjectFolders, getCachedSessionFiles } from "@/lib/projects";
import { batchAll } from "@/lib/concurrency";
import type { EvalRunResult, EvalRunSummary } from "@/lib/evals/types";
import type { EnrichRunResult, EnrichRunSummary } from "@/lib/evals/enrich-types";

// ── Priority constants ──

export const Priority = {
  HIGH: 0,
  LOW: 10,
} as const;

export type PriorityValue = (typeof Priority)[keyof typeof Priority];

export const HIGH = Priority.HIGH;
export const LOW = Priority.LOW;

export function priorityLabel(priority: number): string {
  if (priority <= Priority.HIGH) return "HIGH";
  return "LOW";
}

// ── Types ──

export interface QueueEntry {
  key: string;           // "eval:project/session/itemName" or "enrichment:..."
  type: "eval" | "enrichment";
  projectName: string;
  sessionId: string;
  itemName: string;
  priority: number;
  addedAt: number;
}

interface InternalQueueEntry extends QueueEntry {
  task: () => Promise<unknown>;
}

export interface ProcessingEntry {
  key: string;
  type: "eval" | "enrichment";
  projectName: string;
  sessionId: string;
  itemName: string;
  priority: number;
  startedAt: number;
}

export interface CompletedEntry {
  key: string;
  type: "eval" | "enrichment";
  projectName: string;
  sessionId: string;
  itemName: string;
  completedAt: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

interface UnifiedQueueState {
  pending: InternalQueueEntry[];
  pendingExecutors: Map<string, () => void>;
  processing: Map<string, ProcessingEntry>;
  promises: Map<string, Promise<unknown>>;
  completed: CompletedEntry[];
  activeWorkers: number;
  scannedAt: number;
  intervalId: ReturnType<typeof setTimeout> | null;
  errors: Array<{ key: string; error: string; at: number }>;
}

const QUEUE_KEY = "__CLAUDEYE_QUEUE__";
const COMPLETED_MAX = 200;
const MAX_ERRORS = 50;

interface GlobalWithQueue {
  [QUEUE_KEY]?: UnifiedQueueState;
}

// ── Queue state ──

function getQueueState(): UnifiedQueueState {
  const g = globalThis as unknown as GlobalWithQueue;
  if (!g[QUEUE_KEY]) {
    g[QUEUE_KEY] = {
      pending: [],
      pendingExecutors: new Map(),
      processing: new Map(),
      promises: new Map(),
      completed: [],
      activeWorkers: 0,
      scannedAt: 0,
      intervalId: null,
      errors: [],
    };
  }
  return g[QUEUE_KEY];
}

// ── Concurrency ──

const getConcurrency = () =>
  parseInt(process.env.CLAUDEYE_QUEUE_CONCURRENCY ?? "2", 10) || 2;

// ── Completed ring buffer pruning ──

function pruneCompleted(state: UnifiedQueueState): void {
  if (!state.completed) {
    state.completed = [];
    return;
  }
  const ttlSec = parseInt(process.env.CLAUDEYE_QUEUE_HISTORY_TTL ?? "3600", 10) || 3600;
  const cutoff = Date.now() - ttlSec * 1000;
  state.completed = state.completed.filter((e) => e.completedAt > cutoff);
  if (state.completed.length > COMPLETED_MAX) {
    state.completed = state.completed.slice(0, COMPLETED_MAX);
  }
}

// ── Alert integration ──

async function tryFireSessionAlerts(projectName: string, sessionId: string): Promise<void> {
  try {
    if (!hasAlerts()) return;

    await ensureEvalsLoaded();

    const contentHash = await hashSessionFile(projectName, sessionId);
    if (!contentHash) return;

    const evals = getSessionScopedEvals();
    const enrichers = getSessionScopedEnrichers();

    // Check all caches in parallel
    const [evalCached, enrichCached] = await Promise.all([
      Promise.all(evals.map(item =>
        getPerItemCache<EvalRunResult>(
          "evals", projectName, sessionId, item.name, hashItemCode(item.fn), contentHash,
        )
      )),
      Promise.all(enrichers.map(item =>
        getPerItemCache<EnrichRunResult>(
          "enrichments", projectName, sessionId, item.name, hashItemCode(item.fn), contentHash,
        )
      )),
    ]);

    if (evalCached.some(r => !r) || enrichCached.some(r => !r)) return; // Not all done yet

    const evalResults = evalCached.map(r => r!.value);
    const enrichResults = enrichCached.map(r => r!.value);

    // All items have cached results — build summaries and fire
    const evalSummary: EvalRunSummary | undefined = evalResults.length > 0
      ? {
          results: evalResults,
          totalDurationMs: evalResults.reduce((sum, r) => sum + r.durationMs, 0),
          passCount: evalResults.filter(r => !r.error && !r.skipped && r.pass).length,
          failCount: evalResults.filter(r => !r.error && !r.skipped && !r.pass).length,
          errorCount: evalResults.filter(r => !!r.error).length,
          skippedCount: evalResults.filter(r => !!r.skipped).length,
        }
      : undefined;

    const enrichSummary: EnrichRunSummary | undefined = enrichResults.length > 0
      ? {
          results: enrichResults,
          totalDurationMs: enrichResults.reduce((sum, r) => sum + r.durationMs, 0),
          errorCount: enrichResults.filter(r => !!r.error).length,
          skippedCount: enrichResults.filter(r => !!r.skipped).length,
        }
      : undefined;

    await fireAlerts({ projectName, sessionId, evalSummary, enrichSummary });
  } catch (err) {
    console.error("[eval-queue] tryFireSessionAlerts error:", err instanceof Error ? err.message : err);
  }
}

// ── Debounced alert firing ──

const alertDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedFireAlerts(projectName: string, sessionId: string): void {
  const key = `${projectName}/${sessionId}`;
  const existing = alertDebounceTimers.get(key);
  if (existing) clearTimeout(existing);
  alertDebounceTimers.set(
    key,
    setTimeout(() => {
      alertDebounceTimers.delete(key);
      tryFireSessionAlerts(projectName, sessionId).catch(() => {});
    }, 500),
  );
}

// ── Sorted insertion (avoids O(N log N) re-sort on every enqueue) ──

function insertSorted(arr: InternalQueueEntry[], entry: InternalQueueEntry): void {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const cmp = arr[mid].priority - entry.priority || arr[mid].addedAt - entry.addedAt;
    if (cmp <= 0) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, entry);
}

// ── Drain queue ──

function drainQueue(): void {
  const state = getQueueState();
  const concurrency = getConcurrency();

  while (state.activeWorkers < concurrency && state.pending.length > 0) {
    const entry = state.pending.shift()!;
    const executor = state.pendingExecutors.get(entry.key);
    state.pendingExecutors.delete(entry.key);
    if (executor) executor();
  }
}

// ── queuePerItem: the single entry point for all work ──

export function queuePerItem<T>(
  type: "eval" | "enrichment",
  projectName: string,
  sessionId: string,
  itemName: string,
  task: () => Promise<T>,
  options?: { priority?: number; forceRefresh?: boolean },
): Promise<T> {
  const state = getQueueState();
  const key = `${type}:${projectName}/${sessionId}/${itemName}`;
  const priority = options?.priority ?? Priority.HIGH;
  const forceRefresh = options?.forceRefresh ?? false;
  const concurrency = getConcurrency();

  // Coalesce: if already in-flight and not forcing, return existing promise
  const existing = state.promises.get(key);
  if (existing && !forceRefresh) {
    // Priority upgrade: if key is in pending at lower priority, upgrade
    const pendingEntry = state.pending.find(e => e.key === key);
    if (pendingEntry && priority < pendingEntry.priority) {
      pendingEntry.priority = priority;
      state.pending.sort((a, b) => a.priority - b.priority || a.addedAt - b.addedAt);
    }
    return existing as Promise<T>;
  }

  // If forceRefresh and existing, chain after it
  if (existing && forceRefresh) {
    const chained = existing
      .catch(() => {})
      .then(() => queuePerItem<T>(type, projectName, sessionId, itemName, task, { priority }));
    return chained;
  }

  const runTask = () => {
    state.activeWorkers++;
    state.processing.set(key, {
      key,
      type,
      projectName,
      sessionId,
      itemName,
      priority,
      startedAt: Date.now(),
    });
    const startTime = Date.now();

    const onComplete = (success: boolean, err?: string) => {
      state.activeWorkers--;
      state.processing.delete(key);
      state.promises.delete(key);

      // Prune + push completed entry
      pruneCompleted(state);
      state.completed.unshift({
        key,
        type,
        projectName,
        sessionId,
        itemName,
        completedAt: Date.now(),
        durationMs: Date.now() - startTime,
        success,
        error: err,
      });

      if (!success && err) {
        state.errors.push({ key, error: err, at: Date.now() });
        if (state.errors.length > MAX_ERRORS) {
          state.errors = state.errors.slice(-MAX_ERRORS);
        }
      }

      // Fire alerts (debounced, fire-and-forget) on success
      if (success) {
        debouncedFireAlerts(projectName, sessionId);
      }

      drainQueue();
    };

    let promise: Promise<unknown>;
    try {
      promise = task().then(
        (result) => {
          onComplete(true);
          return result;
        },
        (error) => {
          onComplete(false, error instanceof Error ? error.message : String(error));
          throw error;
        },
      );
    } catch (error) {
      onComplete(false, error instanceof Error ? error.message : String(error));
      promise = Promise.reject(error);
    }

    state.promises.set(key, promise);
    return promise;
  };

  // If under concurrency limit, run immediately
  if (state.activeWorkers < concurrency) {
    return runTask() as Promise<T>;
  }

  // Otherwise, queue it and return a promise that resolves when the task eventually runs
  const promise = new Promise<T>((resolve, reject) => {
    insertSorted(state.pending, {
      key,
      type,
      projectName,
      sessionId,
      itemName,
      priority,
      addedAt: Date.now(),
      task,
    });

    state.pendingExecutors.set(key, () => {
      runTask().then(resolve as (v: unknown) => void, reject);
    });
  });

  state.promises.set(key, promise);
  return promise;
}

// ── Unified queue status ──

export function getQueueStatus() {
  const state = getQueueState();
  return {
    pending: state.pending.map(e => ({
      key: e.key,
      type: e.type,
      projectName: e.projectName,
      sessionId: e.sessionId,
      itemName: e.itemName,
      priority: e.priority,
      priorityLabel: priorityLabel(e.priority),
      addedAt: e.addedAt,
    })),
    processing: Array.from(state.processing.values()),
    completed: state.completed,
    scannedAt: state.scannedAt,
    backgroundRunning: state.intervalId !== null,
    recentErrors: state.errors.slice(-10),
  };
}

// ── Scan and enqueue uncached sessions ──

export async function scanAndEnqueue(): Promise<void> {
  try {
    await ensureEvalsLoaded();

    const hasWork = hasEvals() || hasEnrichers();
    if (!hasWork) return;

    const state = getQueueState();
    state.scannedAt = Date.now();

    const evals = getSessionScopedEvals();
    const enrichers = getSessionScopedEnrichers();

    const projects = await getCachedProjectFolders();

    // Discover all sessions
    const fileResults = await batchAll(
      projects.map((project) => async () => {
        const sessionFiles = await getCachedSessionFiles(project.path);
        return { project, sessionFiles };
      }),
      10,
    );

    type SessionInfo = { projectName: string; sessionId: string; lastModified: number };
    const sessions: SessionInfo[] = [];

    for (const result of fileResults) {
      if (result.status === "fulfilled") {
        for (const file of result.value.sessionFiles) {
          if (file.sessionId) {
            sessions.push({
              projectName: result.value.project.name,
              sessionId: file.sessionId,
              lastModified: file.lastModified.getTime(),
            });
          }
        }
      }
    }

    // Sort newest first within LOW priority
    sessions.sort((a, b) => b.lastModified - a.lastModified);

    // Dynamically import workers to avoid circular deps at module level
    const { processSessionEval } = await import("@/app/actions/process-session-eval");
    const { processSessionEnrichment } = await import("@/app/actions/process-session-enrichment");

    // Pre-compute item code hashes once (memoized, but avoids repeated WeakMap lookups)
    const evalHashes = evals.map(e => hashItemCode(e.fn));
    const enrichHashes = enrichers.map(e => hashItemCode(e.fn));

    // Check cache for each session and enqueue uncached items individually
    // Process in small batches with yield points to avoid starving the event loop
    const BATCH_SIZE = 5;
    for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
      const batch = sessions.slice(i, i + BATCH_SIZE);
      await batchAll(
        batch.map((s) => async () => {
          let contentHash: string;
          try {
            contentHash = await hashSessionFile(s.projectName, s.sessionId);
          } catch {
            return; // Skip sessions we can't hash
          }

          // Check all caches in parallel, then enqueue uncached items
          const cacheChecks = await Promise.all([
            ...evals.map((_, j) =>
              getPerItemCache<EvalRunResult>(
                "evals", s.projectName, s.sessionId, evals[j].name, evalHashes[j], contentHash,
              ).then(cached => ({ cached: !!cached, type: "eval" as const, idx: j }))
            ),
            ...enrichers.map((_, j) =>
              getPerItemCache<EnrichRunResult>(
                "enrichments", s.projectName, s.sessionId, enrichers[j].name, enrichHashes[j], contentHash,
              ).then(cached => ({ cached: !!cached, type: "enrichment" as const, idx: j }))
            ),
          ]);
          for (const r of cacheChecks) {
            if (r.cached) continue;
            if (r.type === "eval") {
              queuePerItem("eval", s.projectName, s.sessionId, evals[r.idx].name,
                () => processSessionEval(s.projectName, s.sessionId, evals[r.idx].name),
                { priority: Priority.LOW },
              ).catch(() => {}); // fire-and-forget
            } else {
              queuePerItem("enrichment", s.projectName, s.sessionId, enrichers[r.idx].name,
                () => processSessionEnrichment(s.projectName, s.sessionId, enrichers[r.idx].name),
                { priority: Priority.LOW },
              ).catch(() => {}); // fire-and-forget
            }
          }
        }),
        BATCH_SIZE,
      );
      // Yield to the event loop between batches so HTTP requests can be served
      if (i + BATCH_SIZE < sessions.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } catch (err) {
    console.error("[eval-queue] scanAndEnqueue error:", err);
  }
}

// ── Background processor ──

export function startBackgroundProcessor(intervalSec: number): void {
  const state = getQueueState();
  if (state.intervalId) return; // Already running

  console.log(`[eval-queue] Starting background processor (interval: ${intervalSec}s)`);

  const scheduleNext = () => {
    state.intervalId = setTimeout(async () => {
      try {
        await scanAndEnqueue();
      } catch (err) {
        console.error("[eval-queue] Background processing error:", err);
      }
      if (state.intervalId !== null) scheduleNext();
    }, intervalSec * 1000);
  };
  scheduleNext();
}

export function stopBackgroundProcessor(): void {
  const state = getQueueState();
  if (state.intervalId) {
    clearTimeout(state.intervalId);
    state.intervalId = null;
    console.log("[eval-queue] Background processor stopped");
  }
}
