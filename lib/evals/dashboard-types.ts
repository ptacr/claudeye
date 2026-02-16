/**
 * Type definitions for the dashboard filter system.
 *
 * Filters return boolean/number/string values. The UI control type is
 * auto-detected from the first non-null computed value across all sessions:
 *   - boolean → three-state toggle (true / false / any)
 *   - number  → range slider with observed min/max
 *   - string  → multi-select dropdown with observed unique values
 *
 * Reuses EvalContext from types.ts — no duplication.
 */
import type { EvalContext, ConditionFunction } from "./types";

/** Allowed return types for filter functions. */
export type FilterValue = boolean | number | string;

/** A filter function signature. */
export type FilterFunction = (
  context: EvalContext,
) => FilterValue | Promise<FilterValue>;

/** Options when registering a filter. */
export interface FilterOptions {
  /** Human-readable label for the tile. Defaults to the filter name. */
  label?: string;
  /** Per-filter condition that gates execution. */
  condition?: ConditionFunction;
}

/** A filter function stored in the registry. */
export interface RegisteredFilter {
  name: string;
  fn: FilterFunction;
  label: string;
  condition?: ConditionFunction;
  view: string;
}

/** Options when creating a dashboard view. */
export interface ViewOptions {
  label?: string;
}

/** A named dashboard view stored in the registry. */
export interface RegisteredView {
  name: string;
  label: string;
}

/** Info about a view, returned to the client for the view index. */
export interface DashboardViewInfo {
  name: string;
  label: string;
  filterCount: number;
}

/** Result of computing a single filter for one session. */
export interface FilterComputeResult {
  name: string;
  value: FilterValue;
  durationMs: number;
  error?: string;
  skipped?: boolean;
}

/** Summary of computing all filters for one session. */
export interface FilterComputeSummary {
  results: FilterComputeResult[];
  totalDurationMs: number;
  errorCount: number;
  skippedCount: number;
}

/** Metadata for a boolean filter — three-state toggle. */
export interface BooleanFilterMeta {
  type: "boolean";
  name: string;
  label: string;
}

/** Metadata for a number filter — range slider with min/max. */
export interface NumberFilterMeta {
  type: "number";
  name: string;
  label: string;
  min: number;
  max: number;
}

/** Metadata for a string filter — multi-select dropdown. */
export interface StringFilterMeta {
  type: "string";
  name: string;
  label: string;
  values: string[];
}

/** Discriminated union of filter metadata. */
export type FilterMeta = BooleanFilterMeta | NumberFilterMeta | StringFilterMeta;

/** A single session row in the dashboard payload. */
export interface DashboardSessionRow {
  projectName: string;
  sessionId: string;
  lastModified: string;
  lastModifiedFormatted: string;
  filterValues: Record<string, FilterValue>;
}

/** Full dashboard payload returned by the server action. */
export interface DashboardPayload {
  sessions: DashboardSessionRow[];  // One page only
  filterMeta: FilterMeta[];
  totalDurationMs: number;
  totalCount: number;      // Before filtering
  matchingCount: number;   // After filtering
  page: number;
  pageSize: number;
}

/** Serializable filter state for server-side filtering (Sets aren't serializable). */
export type SerializedFilterState =
  | { type: "boolean"; value: "all" | "true" | "false" }
  | { type: "number"; min: number; max: number }
  | { type: "string"; selected: string[] };

export type SerializedFilters = Record<string, SerializedFilterState>;
