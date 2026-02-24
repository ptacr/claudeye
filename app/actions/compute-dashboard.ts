"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getFiltersForView } from "@/lib/evals/dashboard-registry";
import { runAllFilters } from "@/lib/evals/dashboard-runner";
import { parseSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedProjectFolders, getCachedSessionFiles } from "@/lib/projects";
import { getCachedResult, setCachedResult, hashSessionFile } from "@/lib/cache";
import { hashEvalsModule } from "@/lib/cache/hash";
import { batchAll } from "@/lib/concurrency";
import { formatDate } from "@/lib/utils";
import type {
  DashboardPayload,
  DashboardSessionRow,
  FilterComputeSummary,
  FilterMeta,
  FilterValue,
  SerializedFilters,
} from "@/lib/evals/dashboard-types";

export type DashboardActionResult =
  | { ok: true; payload: DashboardPayload; hasFilters: true }
  | { ok: true; hasFilters: false }
  | { ok: false; error: string };

// ── DashboardIndex — incremental row cache stored in globalThis ──

interface FilterAccumulator {
  type: "unknown" | "boolean" | "number" | "string";
  // number accumulators
  min: number;
  max: number;
  // string accumulator
  uniqueStrings: Set<string>;
}

interface DashboardIndex {
  viewName: string;
  evalsHash: string;
  rows: Map<string, DashboardSessionRow>;
  contentHashes: Map<string, string>;
  accumulators: Record<string, FilterAccumulator>;
  filterNames: string[];
  filterLabels: Record<string, string>;
  metaDirty: boolean;
  cachedFilterMeta: FilterMeta[] | null;
}

const INDEX_KEY = "__CLAUDEYE_DASHBOARD_INDEX__";

interface GlobalWithIndex {
  [INDEX_KEY]?: DashboardIndex;
}

function getOrCreateIndex(
  viewName: string,
  evalsHash: string,
  filterNames: string[],
  filterLabels: Record<string, string>,
): DashboardIndex {
  const g = globalThis as GlobalWithIndex;
  const existing = g[INDEX_KEY];

  if (
    existing &&
    existing.viewName === viewName &&
    existing.evalsHash === evalsHash &&
    existing.filterNames.length === filterNames.length &&
    existing.filterNames.every((n, i) => n === filterNames[i])
  ) {
    return existing;
  }

  // Create fresh index
  const accumulators: Record<string, FilterAccumulator> = {};
  for (const name of filterNames) {
    accumulators[name] = { type: "unknown", min: Infinity, max: -Infinity, uniqueStrings: new Set() };
  }

  const index: DashboardIndex = {
    viewName,
    evalsHash,
    rows: new Map(),
    contentHashes: new Map(),
    accumulators,
    filterNames,
    filterLabels,
    metaDirty: true,
    cachedFilterMeta: null,
  };

  g[INDEX_KEY] = index;
  return index;
}

function updateAccumulators(
  accumulators: Record<string, FilterAccumulator>,
  filterValues: Record<string, FilterValue>,
) {
  for (const [name, value] of Object.entries(filterValues)) {
    const acc = accumulators[name];
    if (!acc) continue;

    if (typeof value === "boolean") {
      acc.type = "boolean";
    } else if (typeof value === "number") {
      acc.type = "number";
      if (value < acc.min) acc.min = value;
      if (value > acc.max) acc.max = value;
    } else if (typeof value === "string") {
      acc.type = "string";
      acc.uniqueStrings.add(value);
    }
  }
}

function rebuildAccumulators(index: DashboardIndex) {
  // Reset all accumulators
  for (const name of index.filterNames) {
    index.accumulators[name] = { type: "unknown", min: Infinity, max: -Infinity, uniqueStrings: new Set() };
  }
  // Rebuild from all rows
  for (const row of index.rows.values()) {
    updateAccumulators(index.accumulators, row.filterValues);
  }
}

function buildFilterMeta(index: DashboardIndex): FilterMeta[] {
  if (!index.metaDirty && index.cachedFilterMeta) {
    return index.cachedFilterMeta;
  }

  if (index.metaDirty) {
    rebuildAccumulators(index);
  }

  const meta: FilterMeta[] = index.filterNames.map((name) => {
    const acc = index.accumulators[name];
    const label = index.filterLabels[name] ?? name;

    if (acc.type === "number") {
      return { type: "number" as const, name, label, min: acc.min, max: acc.max };
    }
    if (acc.type === "string") {
      return { type: "string" as const, name, label, values: Array.from(acc.uniqueStrings).sort() };
    }
    // boolean or unknown → default to boolean
    return { type: "boolean" as const, name, label };
  });

  index.cachedFilterMeta = meta;
  index.metaDirty = false;
  return meta;
}

// ── Server-side filtering ──

function applyServerFilters(
  sessions: DashboardSessionRow[],
  filterMeta: FilterMeta[],
  filters: SerializedFilters,
): DashboardSessionRow[] {
  return sessions.filter((session) => {
    for (const m of filterMeta) {
      const filterState = filters[m.name];
      if (!filterState) continue;

      const value = session.filterValues[m.name];
      if (value === undefined) continue;

      switch (filterState.type) {
        case "boolean": {
          if (filterState.value === "all") continue;
          if (filterState.value === "true" && value !== true) return false;
          if (filterState.value === "false" && value !== false) return false;
          break;
        }
        case "number": {
          const num = value as number;
          if (num < filterState.min || num > filterState.max) return false;
          break;
        }
        case "string": {
          if (filterState.selected.length > 0 && !filterState.selected.includes(value as string)) return false;
          break;
        }
      }
    }
    return true;
  });
}

// ── Main action ──

/**
 * Server action that loads filters (if configured), computes them across
 * all projects and sessions, and returns the dashboard payload.
 *
 * @param viewName — When provided, only filters for that view are used.
 *                   Defaults to "default" for backward compatibility.
 * @param options — Optional server-side filtering and pagination.
 */
export async function computeDashboard(
  viewName?: string,
  options?: { filters?: SerializedFilters; page?: number; pageSize?: number },
): Promise<DashboardActionResult> {
  try {
    await ensureEvalsLoaded();

    const filters = getFiltersForView(viewName ?? "default");

    if (filters.length === 0) {
      return { ok: true, hasFilters: false };
    }

    const overallStart = performance.now();
    const resolvedViewName = viewName ?? "default";

    const evalsHash = await hashEvalsModule();
    const filterNames = filters.map((f) => f.name);
    const filterLabels: Record<string, string> = {};
    for (const f of filters) {
      filterLabels[f.name] = f.label;
    }

    const index = getOrCreateIndex(resolvedViewName, evalsHash, filterNames, filterLabels);

    const projects = await getCachedProjectFolders();

    // Discover all (project, sessionFile) pairs
    const CONCURRENCY = 10;
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
    const tasksByKey = new Map<string, SessionTask>();
    for (const task of allSessionTasks) {
      const key = `${task.project.name}/${task.file.sessionId}`;
      currentKeys.add(key);
      tasksByKey.set(key, task);
    }

    // Detect deleted sessions
    for (const existingKey of index.rows.keys()) {
      if (!currentKeys.has(existingKey)) {
        index.rows.delete(existingKey);
        index.contentHashes.delete(existingKey);
        index.metaDirty = true;
      }
    }

    // Find new or changed sessions
    type ComputeTask = { key: string; task: SessionTask };
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

      if (existingHash === contentHash && index.rows.has(key)) {
        // Unchanged — skip
        continue;
      }

      toCompute.push({ key, task: { project, file } });
      index.contentHashes.set(key, contentHash);
    }

    // Process new/changed sessions in batches
    if (toCompute.length > 0) {
      for (let i = 0; i < toCompute.length; i += CONCURRENCY) {
        const batch = toCompute.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ key, task: { project, file } }) => {
            const sid = file.sessionId as string;
            const cacheSessionKey = `${resolvedViewName}/${sid}`;
            const contentHash = index.contentHashes.get(key) ?? "";

            // Try disk cache first
            const cached = await getCachedResult<FilterComputeSummary>(
              "filters",
              project.name,
              cacheSessionKey,
              filterNames,
              contentHash,
            );

            let summary: FilterComputeSummary;
            if (cached) {
              summary = cached.value;
            } else {
              // Parse directly — don't pollute the runtime cache
              const { entries, rawLines } = await parseSessionLog(project.name, sid);
              const stats = calculateLogStats(entries);
              summary = await runAllFilters(rawLines, stats, project.name, sid, filters);

              // Store in disk cache (fire-and-forget)
              setCachedResult("filters", project.name, cacheSessionKey, summary, filterNames, contentHash);
            }

            const filterValues: Record<string, FilterValue> = {};
            for (const result of summary.results) {
              if (!result.skipped && !result.error) {
                filterValues[result.name] = result.value;
              }
            }

            const row: DashboardSessionRow = {
              projectName: project.name,
              sessionId: sid,
              lastModified: file.lastModified.toISOString(),
              lastModifiedFormatted: file.lastModifiedFormatted || formatDate(file.lastModified),
              filterValues,
            };

            return { key, row };
          }),
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            const { key, row } = result.value;
            index.rows.set(key, row);
            index.metaDirty = true;
          }
        }
      }
    }

    // Build filter meta
    const filterMeta = buildFilterMeta(index);

    // Get all sessions as array
    const allSessions = Array.from(index.rows.values());

    // Apply server-side filtering
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 25;
    let matchingSessions: DashboardSessionRow[];

    if (options?.filters && Object.keys(options.filters).length > 0) {
      matchingSessions = applyServerFilters(allSessions, filterMeta, options.filters);
    } else {
      matchingSessions = allSessions;
    }

    // Sort by lastModified descending
    matchingSessions.sort((a, b) => b.lastModified.localeCompare(a.lastModified));

    // Paginate
    const totalCount = allSessions.length;
    const matchingCount = matchingSessions.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedSessions = matchingSessions.slice(startIndex, startIndex + pageSize);

    const totalDurationMs = Math.round(performance.now() - overallStart);

    return {
      ok: true,
      hasFilters: true,
      payload: {
        sessions: paginatedSessions,
        filterMeta,
        totalDurationMs,
        totalCount,
        matchingCount,
        page,
        pageSize,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
