/** Dashboard client — orchestrates filter computation with server-side filtering & pagination. */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { computeDashboard } from "@/app/actions/compute-dashboard";
import type {
  DashboardPayload,
  FilterMeta,
  SerializedFilters,
} from "@/lib/evals/dashboard-types";
import FilterTileBoolean, { type BooleanFilterState } from "./tiles/filter-tile-boolean";
import FilterTileNumber, { type NumberFilterState } from "./tiles/filter-tile-number";
import FilterTileString, { type StringFilterState } from "./tiles/filter-tile-string";
import DashboardSessionsTable from "./dashboard-sessions-table";
import { Loader2 } from "lucide-react";

/** Active filter state — keyed by filter name. */
type ActiveFilters = Record<
  string,
  BooleanFilterState | NumberFilterState | StringFilterState
>;

/** Initialize filter state from filter meta. */
function initializeFilters(meta: FilterMeta[]): ActiveFilters {
  const filters: ActiveFilters = {};
  for (const m of meta) {
    switch (m.type) {
      case "boolean":
        filters[m.name] = "all" as BooleanFilterState;
        break;
      case "number":
        filters[m.name] = { min: m.min, max: m.max } as NumberFilterState;
        break;
      case "string":
        filters[m.name] = new Set(m.values) as StringFilterState;
        break;
    }
  }
  return filters;
}

/** Serialize client filter state into a format safe for server actions. */
function serializeFilters(
  activeFilters: ActiveFilters,
  meta: FilterMeta[],
): SerializedFilters {
  const serialized: SerializedFilters = {};
  for (const m of meta) {
    const state = activeFilters[m.name];
    if (!state) continue;

    switch (m.type) {
      case "boolean":
        serialized[m.name] = { type: "boolean", value: state as BooleanFilterState };
        break;
      case "number": {
        const ns = state as NumberFilterState;
        serialized[m.name] = { type: "number", min: ns.min, max: ns.max };
        break;
      }
      case "string": {
        const ss = state as StringFilterState;
        serialized[m.name] = { type: "string", selected: Array.from(ss) };
        break;
      }
    }
  }
  return serialized;
}

/** Check if any filters are actually constraining results. */
function hasActiveConstraints(
  activeFilters: ActiveFilters,
  meta: FilterMeta[],
): boolean {
  for (const m of meta) {
    const state = activeFilters[m.name];
    if (!state) continue;
    switch (m.type) {
      case "boolean":
        if ((state as BooleanFilterState) !== "all") return true;
        break;
      case "number": {
        const ns = state as NumberFilterState;
        if (ns.min !== m.min || ns.max !== m.max) return true;
        break;
      }
      case "string": {
        const ss = state as StringFilterState;
        if (ss.size !== m.values.length) return true;
        break;
      }
    }
  }
  return false;
}

export default function DashboardClient({ viewName }: { viewName: string }) {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noFilters, setNoFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchDashboard = useCallback(async (
    filters?: SerializedFilters,
    page?: number,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await computeDashboard(viewName, {
        filters,
        page: page ?? 1,
        pageSize: 25,
      });
      if (!result.ok) {
        setError(result.error);
      } else if (!result.hasFilters) {
        setNoFilters(true);
      } else {
        setPayload(result.payload);
        // Persist filterMeta so filter UI doesn't flash on re-fetches
        if (result.payload.filterMeta.length > 0) {
          setFilterMeta(result.payload.filterMeta);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [viewName]);

  // Initial load
  useEffect(() => {
    fetchDashboard().then(() => {
      // Initialize filters after first load
    });
  }, [fetchDashboard]);

  // Initialize activeFilters when filterMeta first arrives
  useEffect(() => {
    if (filterMeta.length > 0 && Object.keys(activeFilters).length === 0) {
      setActiveFilters(initializeFilters(filterMeta));
    }
  }, [filterMeta, activeFilters]);

  const updateFilter = useCallback(
    (name: string, value: BooleanFilterState | NumberFilterState | StringFilterState) => {
      setActiveFilters((prev) => {
        const next = { ...prev, [name]: value };
        // Debounce server re-fetch
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const hasConstraints = hasActiveConstraints(next, filterMeta);
          const serialized = hasConstraints ? serializeFilters(next, filterMeta) : undefined;
          setCurrentPage(1);
          fetchDashboard(serialized, 1);
        }, 300);
        return next;
      });
    },
    [filterMeta, fetchDashboard],
  );

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    const hasConstraints = hasActiveConstraints(activeFilters, filterMeta);
    const serialized = hasConstraints ? serializeFilters(activeFilters, filterMeta) : undefined;
    fetchDashboard(serialized, newPage);
  }, [activeFilters, filterMeta, fetchDashboard]);

  // --- Render states ---

  if (noFilters) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center">
        <p className="text-muted-foreground mb-2">
          No filters are registered for this view.
        </p>
        <p className="text-sm text-muted-foreground">
          Use <code className="text-foreground bg-muted px-1 py-0.5 rounded">app.dashboard.view()</code> or{" "}
          <code className="text-foreground bg-muted px-1 py-0.5 rounded">app.dashboard.filter()</code> in
          your evals file to register filters.
        </p>
      </div>
    );
  }

  if (loading && !payload) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary animate-spin mr-2" />
        <span className="text-muted-foreground">Computing dashboard filters...</span>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
        <p className="text-sm text-destructive font-medium">Failed to load dashboard</p>
        <p className="text-sm text-destructive/80 mt-1">{error}</p>
        <button
          onClick={() => fetchDashboard()}
          className="mt-3 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!payload) return null;

  const displayMeta = filterMeta.length > 0 ? filterMeta : payload.filterMeta;

  return (
    <div className="space-y-6">
      {/* Filter tiles */}
      {displayMeta.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayMeta.map((meta) => {
            switch (meta.type) {
              case "boolean":
                return (
                  <FilterTileBoolean
                    key={meta.name}
                    meta={meta}
                    value={(activeFilters[meta.name] as BooleanFilterState) ?? "all"}
                    onChange={(v) => updateFilter(meta.name, v)}
                  />
                );
              case "number":
                return (
                  <FilterTileNumber
                    key={meta.name}
                    meta={meta}
                    value={
                      (activeFilters[meta.name] as NumberFilterState) ?? {
                        min: meta.min,
                        max: meta.max,
                      }
                    }
                    onChange={(v) => updateFilter(meta.name, v)}
                  />
                );
              case "string":
                return (
                  <FilterTileString
                    key={meta.name}
                    meta={meta}
                    value={
                      (activeFilters[meta.name] as StringFilterState) ??
                      new Set(meta.values)
                    }
                    onChange={(v) => updateFilter(meta.name, v)}
                  />
                );
            }
          })}
        </div>
      )}

      {/* Timing info */}
      <div className="text-xs text-muted-foreground">
        Computed in {payload.totalDurationMs}ms
        {loading && " (updating...)"}
      </div>

      {/* Sessions table */}
      <DashboardSessionsTable
        sessions={payload.sessions}
        filterMeta={displayMeta}
        totalCount={payload.totalCount}
        matchingCount={payload.matchingCount}
        page={payload.page}
        pageSize={payload.pageSize}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
