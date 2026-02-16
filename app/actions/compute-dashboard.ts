"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import { getFiltersForView, hasFilters } from "@/lib/evals/dashboard-registry";
import { runAllFilters } from "@/lib/evals/dashboard-runner";
import { getCachedSessionLog } from "@/lib/log-entries";
import { calculateLogStats } from "@/lib/log-stats";
import { getCachedProjectFolders, getCachedSessionFiles } from "@/lib/projects";
import { getCachedResult, setCachedResult, hashSessionFile } from "@/lib/cache";
import { batchAll } from "@/lib/concurrency";
import { formatDate } from "@/lib/utils";
import type {
  DashboardPayload,
  DashboardSessionRow,
  FilterComputeSummary,
  FilterMeta,
  FilterValue,
} from "@/lib/evals/dashboard-types";

export type DashboardActionResult =
  | { ok: true; payload: DashboardPayload; hasFilters: true }
  | { ok: true; hasFilters: false }
  | { ok: false; error: string };

/**
 * Server action that loads filters (if configured), computes them across
 * all projects and sessions, and returns the dashboard payload.
 *
 * @param viewName — When provided, only filters for that view are used.
 *                   Defaults to "default" for backward compatibility.
 */
export async function computeDashboard(viewName?: string): Promise<DashboardActionResult> {
  try {
    await ensureEvalsLoaded();

    const filters = getFiltersForView(viewName ?? "default");

    if (filters.length === 0) {
      return { ok: true, hasFilters: false };
    }

    const overallStart = performance.now();

    const projects = await getCachedProjectFolders();
    const sessions: DashboardSessionRow[] = [];
    // Collect all values per filter name for meta computation
    const allValues: Record<string, FilterValue[]> = {};
    const filterNames = filters.map((f) => f.name);
    for (const f of filters) {
      allValues[f.name] = [];
    }

    const CONCURRENCY = 10;

    // Collect all (project, sessionFile) pairs — discover in parallel
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

    // Process sessions in batches of 10 to avoid overwhelming the filesystem
    // with concurrent reads. Each session triggers a JSONL file read + parse.
    for (let i = 0; i < allSessionTasks.length; i += CONCURRENCY) {
      const batch = allSessionTasks.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async ({ project, file }) => {
          const sid = file.sessionId as string;
          const cacheSessionKey = `${viewName ?? "default"}/${sid}`;

          // Compute content hash with the real session ID (not the composite cache key)
          // so hashSessionFile resolves to the actual JSONL file on disk.
          let contentHash: string;
          try {
            contentHash = await hashSessionFile(project.name, sid);
          } catch {
            contentHash = "";
          }

          // Try cache first
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
            const { entries, rawLines } = await getCachedSessionLog(project.name, sid);
            const stats = calculateLogStats(entries);
            summary = await runAllFilters(rawLines, stats, project.name, sid, filters);

            // Store in cache (fire-and-forget)
            setCachedResult("filters", project.name, cacheSessionKey, summary, filterNames, contentHash);
          }

          const filterValues: Record<string, FilterValue> = {};
          const values: Record<string, FilterValue[]> = {};
          for (const result of summary.results) {
            if (!result.skipped && !result.error) {
              filterValues[result.name] = result.value;
              if (!values[result.name]) values[result.name] = [];
              values[result.name].push(result.value);
            }
          }

          const row: DashboardSessionRow = {
            projectName: project.name,
            sessionId: sid,
            lastModified: file.lastModified.toISOString(),
            lastModifiedFormatted: file.lastModifiedFormatted || formatDate(file.lastModified),
            filterValues,
          };
          return { row, values };
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          sessions.push(result.value.row);
          for (const [name, vals] of Object.entries(result.value.values)) {
            allValues[name]?.push(...vals);
          }
        }
      }
    }

    // Derive FilterMeta by inspecting the JS type of the first computed value.
    // This auto-detection determines which UI control to render for each filter.
    const filterMeta: FilterMeta[] = filters.map((f) => {
      const values = allValues[f.name] ?? [];
      if (values.length === 0) {
        // Default to boolean if no data
        return { type: "boolean" as const, name: f.name, label: f.label };
      }

      // Detect type from first non-null value
      const firstValue = values[0];
      if (typeof firstValue === "boolean") {
        return { type: "boolean" as const, name: f.name, label: f.label };
      }
      if (typeof firstValue === "number") {
        let min = Infinity;
        let max = -Infinity;
        for (const v of values) {
          const n = v as number;
          if (n < min) min = n;
          if (n > max) max = n;
        }
        return { type: "number" as const, name: f.name, label: f.label, min, max };
      }
      // string
      const unique = Array.from(new Set(values as string[])).sort();
      return { type: "string" as const, name: f.name, label: f.label, values: unique };
    });

    const totalDurationMs = Math.round(performance.now() - overallStart);

    return {
      ok: true,
      hasFilters: true,
      payload: { sessions, filterMeta, totalDurationMs },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
