"use server";

import { ensureEvalsLoaded } from "@/lib/evals/loader";
import {
  getRegisteredViews,
  hasViews,
  getFiltersForView,
  hasFilters,
  getAggregatesForView,
} from "@/lib/evals/dashboard-registry";
import type { DashboardViewInfo } from "@/lib/evals/dashboard-types";

export type ViewListResult =
  | { ok: true; views: DashboardViewInfo[]; hasDefaultFilters: boolean; hasDefaultAggregates: boolean }
  | { ok: false; error: string };

/**
 * Server action that lists all registered dashboard views and whether
 * default (non-view) filters exist.
 */
export async function listDashboardViews(): Promise<ViewListResult> {
  try {
    await ensureEvalsLoaded();

    const views = getRegisteredViews().map((v) => ({
      name: v.name,
      label: v.label,
      filterCount: getFiltersForView(v.name).length,
      aggregateCount: getAggregatesForView(v.name).length,
    }));

    const hasDefaultFilters = getFiltersForView("default").length > 0;
    const hasDefaultAggregates = getAggregatesForView("default").length > 0;

    return { ok: true, views, hasDefaultFilters, hasDefaultAggregates };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
