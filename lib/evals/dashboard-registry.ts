/**
 * Module-level singleton filter registry backed by globalThis.
 *
 * Filters are keyed by (view, name) — the same filter name can appear in
 * different views. When no view is specified, filters default to the
 * "default" view for backward compatibility.
 *
 * Using globalThis ensures the registry survives webpack chunk splitting
 * and remains a true singleton across dynamic imports.
 */
import type { ConditionFunction } from "./types";
import type { FilterFunction, RegisteredFilter, RegisteredView, AggregateDefinition, RegisteredAggregate } from "./dashboard-types";

const REGISTRY_KEY = "__CLAUDEYE_DASHBOARD_FILTER_REGISTRY__";
const VIEW_REGISTRY_KEY = "__CLAUDEYE_DASHBOARD_VIEW_REGISTRY__";
const AGGREGATE_REGISTRY_KEY = "__CLAUDEYE_DASHBOARD_AGGREGATE_REGISTRY__";

interface GlobalWithRegistry {
  [REGISTRY_KEY]?: RegisteredFilter[];
  [VIEW_REGISTRY_KEY]?: RegisteredView[];
  [AGGREGATE_REGISTRY_KEY]?: RegisteredAggregate[];
}

function getRegistry(): RegisteredFilter[] {
  const g = globalThis as GlobalWithRegistry;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = [];
  }
  return g[REGISTRY_KEY];
}

function getViewRegistry(): RegisteredView[] {
  const g = globalThis as GlobalWithRegistry;
  if (!g[VIEW_REGISTRY_KEY]) {
    g[VIEW_REGISTRY_KEY] = [];
  }
  return g[VIEW_REGISTRY_KEY];
}

export function registerFilter(
  name: string,
  fn: FilterFunction,
  label?: string,
  condition?: ConditionFunction,
  view?: string,
): void {
  const registry = getRegistry();
  const viewName = view ?? "default";
  const entry: RegisteredFilter = { name, fn, label: label ?? name, view: viewName };
  if (condition) entry.condition = condition;
  // Replace if a filter with the same (view, name) already exists
  const idx = registry.findIndex((e) => e.view === viewName && e.name === name);
  if (idx >= 0) {
    registry[idx] = entry;
  } else {
    registry.push(entry);
  }
}

export function getRegisteredFilters(): RegisteredFilter[] {
  return getRegistry();
}

export function getFiltersForView(viewName: string): RegisteredFilter[] {
  return getRegistry().filter((f) => f.view === viewName);
}

export function hasFilters(): boolean {
  return getRegistry().length > 0;
}

export function clearFilters(): void {
  const g = globalThis as GlobalWithRegistry;
  g[REGISTRY_KEY] = [];
}

export function registerView(name: string, label: string): void {
  const registry = getViewRegistry();
  const idx = registry.findIndex((v) => v.name === name);
  if (idx >= 0) {
    registry[idx] = { name, label };
  } else {
    registry.push({ name, label });
  }
}

export function getRegisteredViews(): RegisteredView[] {
  return getViewRegistry();
}

export function hasViews(): boolean {
  return getViewRegistry().length > 0;
}

export function clearViews(): void {
  const g = globalThis as GlobalWithRegistry;
  g[VIEW_REGISTRY_KEY] = [];
}

// ── Aggregate registry ──

function getAggregateRegistry(): RegisteredAggregate[] {
  const g = globalThis as GlobalWithRegistry;
  if (!g[AGGREGATE_REGISTRY_KEY]) {
    g[AGGREGATE_REGISTRY_KEY] = [];
  }
  return g[AGGREGATE_REGISTRY_KEY];
}

export function registerAggregate(
  name: string,
  definition: AggregateDefinition,
  label?: string,
  condition?: ConditionFunction,
  view?: string,
): void {
  const registry = getAggregateRegistry();
  const viewName = view ?? "default";

  const entry: RegisteredAggregate = {
    name,
    collect: definition.collect,
    reduce: definition.reduce,
    label: label ?? name,
    view: viewName,
  };
  if (condition) entry.condition = condition;

  // Replace if same (view, name) exists
  const idx = registry.findIndex((e) => e.view === viewName && e.name === name);
  if (idx >= 0) {
    registry[idx] = entry;
  } else {
    registry.push(entry);
  }
}

export function getAggregatesForView(viewName: string): RegisteredAggregate[] {
  return getAggregateRegistry().filter((a) => a.view === viewName);
}

export function hasAggregates(): boolean {
  return getAggregateRegistry().length > 0;
}

export function clearAggregates(): void {
  const g = globalThis as GlobalWithRegistry;
  g[AGGREGATE_REGISTRY_KEY] = [];
}
