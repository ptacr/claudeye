"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getAggregatesForView, getFiltersForView } from "@/lib/evals/dashboard-registry";
import { getSessionScopedEvals, hasEvals } from "@/lib/evals/registry";
import { getSessionScopedEnrichers, hasEnrichers } from "@/lib/evals/enrich-registry";
import { runAllEvals } from "@/lib/evals/runner";
import { runAllEnrichers } from "@/lib/evals/enrich-runner";
import { runAllFilters } from "@/lib/evals/dashboard-runner";
import { parseSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedProjectFolders, getCachedSessionFiles } from "@/lib/projects";
import { getCachedResult, setCachedResult, hashSessionFile } from "@/lib/cache";
import { hashEvalsModule } from "@/lib/cache/hash";
import { batchAll } from "@/lib/concurrency";
import type {
  AggregateContext,
  AggregatePayload,
  AggregateValue,
  CollectedSession,
  FilterValue,
} from "@/lib/evals/dashboard-types";
import type { EnrichmentValue } from "@/lib/evals/enrich-types";

export type AggregateActionResult =
  | { ok: true; payload: AggregatePayload; hasAggregates: true }
  | { ok: true; hasAggregates: false }
  | { ok: false; error: string };

// ── AggregateIndex — incremental collect cache stored in globalThis ──

interface AggregateIndex {
  viewName: string;
  evalsHash: string;
  aggregateNames: string[];
  collectedSessions: Map<string, CollectedSession>;
  contentHashes: Map<string, string>;
}

const INDEX_KEY = "__CLAUDEYE_AGGREGATE_INDEX__";

interface GlobalWithIndex {
  [INDEX_KEY]?: AggregateIndex;
}

function getOrCreateIndex(
  viewName: string,
  evalsHash: string,
  aggregateNames: string[],
): AggregateIndex {
  const g = globalThis as GlobalWithIndex;
  const existing = g[INDEX_KEY];

  if (
    existing &&
    existing.viewName === viewName &&
    existing.evalsHash === evalsHash &&
    existing.aggregateNames.length === aggregateNames.length &&
    existing.aggregateNames.every((n, i) => n === aggregateNames[i])
  ) {
    return existing;
  }

  const index: AggregateIndex = {
    viewName,
    evalsHash,
    aggregateNames,
    collectedSessions: new Map(),
    contentHashes: new Map(),
  };

  g[INDEX_KEY] = index;
  return index;
}

// ── Main action ──

export async function computeAggregates(
  viewName?: string,
): Promise<AggregateActionResult> {
  try {
    await ensureEvalsLoaded();

    const resolvedViewName = viewName ?? "default";
    const aggregates = getAggregatesForView(resolvedViewName);

    if (aggregates.length === 0) {
      return { ok: true, hasAggregates: false };
    }

    const overallStart = performance.now();
    const evalsHash = await hashEvalsModule();
    const aggregateNames = aggregates.map((a) => a.name);

    const index = getOrCreateIndex(resolvedViewName, evalsHash, aggregateNames);

    // Phase 1: Session Discovery
    const CONCURRENCY = 10;
    const projects = await getCachedProjectFolders();

    type SessionTask = { project: typeof projects[number]; file: Awaited<ReturnType<typeof getCachedSessionFiles>>[number] };
    const allSessionTasks: SessionTask[] = [];
    const fileResults = await batchAll(
      projects.map((project) => async () => {
        const sessionFiles = await getCachedSessionFiles(project.path);
        return { project, sessionFiles };
      }),
      CONCURRENCY,
    );
    for (const result of fileResults) {
      if (result.status === "fulfilled") {
        for (const file of result.value.sessionFiles) {
          if (file.sessionId) {
            allSessionTasks.push({ project: result.value.project, file });
          }
        }
      }
    }

    // Build set of current session keys for diff
    const currentKeys = new Set<string>();
    for (const task of allSessionTasks) {
      const key = `${task.project.name}/${task.file.sessionId}`;
      currentKeys.add(key);
    }

    // Detect deleted sessions
    for (const existingKey of index.collectedSessions.keys()) {
      if (!currentKeys.has(existingKey)) {
        index.collectedSessions.delete(existingKey);
        index.contentHashes.delete(existingKey);
      }
    }

    // Hash sessions and find new/changed
    type ComputeTask = { key: string; task: SessionTask; contentHash: string };
    const toCompute: ComputeTask[] = [];

    const hashResults = await batchAll(
      allSessionTasks.map(({ project, file }) => async () => {
        const sid = file.sessionId as string;
        const key = `${project.name}/${sid}`;
        let contentHash: string;
        try {
          contentHash = await hashSessionFile(project.name, sid);
        } catch {
          contentHash = crypto.randomUUID();
        }
        return { key, contentHash, project, file };
      }),
      CONCURRENCY,
    );

    for (const result of hashResults) {
      if (result.status !== "fulfilled") continue;
      const { key, contentHash, project, file } = result.value;
      const existingHash = index.contentHashes.get(key);

      if (existingHash === contentHash && index.collectedSessions.has(key)) {
        continue; // Unchanged — skip
      }

      toCompute.push({ key, task: { project, file }, contentHash });
    }

    // Phase 2: Per-Session Collect (incremental, cached)
    if (toCompute.length > 0) {
      // Pre-fetch registry info to avoid repeated calls
      const registeredEvals = hasEvals() ? getSessionScopedEvals() : [];
      const registeredEnrichers = hasEnrichers() ? getSessionScopedEnrichers() : [];
      const filters = getFiltersForView(resolvedViewName);

      for (let i = 0; i < toCompute.length; i += CONCURRENCY) {
        const batch = toCompute.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ key, task: { project, file }, contentHash }) => {
            const sid = file.sessionId as string;
            const cacheSessionKey = `${resolvedViewName}/agg/${sid}`;

            // Try disk cache first
            const cached = await getCachedResult<Record<string, Record<string, AggregateValue>>>(
              "aggregates",
              project.name,
              cacheSessionKey,
              aggregateNames,
              contentHash,
            );

            if (cached) {
              // Merge all aggregate values into one flat map
              const mergedValues: Record<string, AggregateValue> = {};
              for (const vals of Object.values(cached.value)) {
                Object.assign(mergedValues, vals);
              }
              return {
                key,
                contentHash,
                collected: {
                  projectName: project.name,
                  sessionId: sid,
                  values: mergedValues,
                } as CollectedSession,
              };
            }

            // Parse session directly — don't pollute runtime cache
            const { entries, rawLines } = await parseSessionLog(project.name, sid);
            const stats = calculateLogStats(entries);

            // Run evals if registered
            const evalResults: AggregateContext["evalResults"] = {};
            if (registeredEvals.length > 0) {
              const evalSummary = await runAllEvals(rawLines, stats, project.name, sid, registeredEvals);
              for (const r of evalSummary.results) {
                if (!r.skipped) {
                  evalResults[r.name] = { pass: r.pass, score: r.score, error: r.error, message: r.message };
                }
              }
            }

            // Run enrichers if registered
            const enrichResults: AggregateContext["enrichResults"] = {};
            if (registeredEnrichers.length > 0) {
              const enrichSummary = await runAllEnrichers(rawLines, stats, project.name, sid, registeredEnrichers);
              for (const r of enrichSummary.results) {
                if (!r.skipped && !r.error) {
                  enrichResults[r.name] = r.data as Record<string, EnrichmentValue>;
                }
              }
            }

            // Run filters if registered for this view
            const filterValues: Record<string, FilterValue> = {};
            if (filters.length > 0) {
              const filterSummary = await runAllFilters(rawLines, stats, project.name, sid, filters);
              for (const r of filterSummary.results) {
                if (!r.skipped && !r.error) {
                  filterValues[r.name] = r.value;
                }
              }
            }

            // Build context
            const context: AggregateContext = {
              entries: rawLines,
              stats,
              projectName: project.name,
              sessionId: sid,
              source: "session",
              evalResults,
              enrichResults,
              filterValues,
            };

            // Run each aggregate's collect function
            const allCollectedValues: Record<string, Record<string, AggregateValue>> = {};
            const mergedValues: Record<string, AggregateValue> = {};

            for (const agg of aggregates) {
              try {
                // Check condition
                if (agg.condition) {
                  const condCtx = { entries: rawLines, stats, projectName: project.name, sessionId: sid, source: "session" };
                  const condResult = await agg.condition(condCtx);
                  if (!condResult) continue;
                }

                const values = await agg.collect(context);
                allCollectedValues[agg.name] = values;
                Object.assign(mergedValues, values);
              } catch {
                // Individual aggregate collect failure — skip this aggregate for this session
              }
            }

            // Cache collected values (fire-and-forget)
            setCachedResult(
              "aggregates",
              project.name,
              cacheSessionKey,
              allCollectedValues,
              aggregateNames,
              contentHash,
            );

            return {
              key,
              contentHash,
              collected: {
                projectName: project.name,
                sessionId: sid,
                values: mergedValues,
              } as CollectedSession,
            };
          }),
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            const { key, contentHash, collected } = result.value;
            index.collectedSessions.set(key, collected);
            index.contentHashes.set(key, contentHash);
          }
        }
      }
    }

    // Phase 3: Reduce
    const allCollected = Array.from(index.collectedSessions.values());

    const payloadAggregates: AggregatePayload["aggregates"] = [];

    for (const agg of aggregates) {
      try {
        const rows = await agg.reduce(allCollected);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        payloadAggregates.push({
          name: agg.name,
          label: agg.label,
          rows,
          columns,
        });
      } catch {
        // Reduce failed — skip this aggregate
        payloadAggregates.push({
          name: agg.name,
          label: agg.label,
          rows: [],
          columns: [],
        });
      }
    }

    const totalDurationMs = Math.round(performance.now() - overallStart);

    return {
      ok: true,
      hasAggregates: true,
      payload: {
        aggregates: payloadAggregates,
        totalSessions: allCollected.length,
        totalDurationMs,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
