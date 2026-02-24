/** Dashboard page — view index or default filters (backward compat). */
import Link from "next/link";
import { listDashboardViews } from "@/app/actions/list-dashboard-views";
import DashboardClient from "./dashboard-client";
import AggregateClient from "./aggregate-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const result = await listDashboardViews();

  // Error state
  if (!result.ok) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
          </div>
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm text-destructive font-medium">Failed to load dashboard</p>
            <p className="text-sm text-destructive/80 mt-1">{result.error}</p>
          </div>
        </div>
      </main>
    );
  }

  const { views, hasDefaultFilters, hasDefaultAggregates } = result;

  // Named views exist → show view index
  if (views.length > 0) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a view to explore filtered sessions.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {views.map((view) => (
              <Link
                key={view.name}
                href={`/dashboard/${encodeURIComponent(view.name)}`}
                className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 hover:shadow-sm transition-all group"
              >
                <h3 className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                  {view.label}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {view.filterCount} {view.filterCount === 1 ? "filter" : "filters"}
                  {view.aggregateCount > 0 && (
                    <span>
                      {" "}&middot; {view.aggregateCount} {view.aggregateCount === 1 ? "aggregate" : "aggregates"}
                    </span>
                  )}
                </p>
              </Link>
            ))}
          </div>
          {hasDefaultFilters && (
            <div className="mt-8">
              <h3 className="text-lg font-medium text-foreground mb-4">Default Filters</h3>
              <DashboardClient viewName="default" />
            </div>
          )}
          {hasDefaultAggregates && (
            <div className="mt-8">
              <AggregateClient viewName="default" />
            </div>
          )}
        </div>
      </main>
    );
  }

  // Only default filters (no named views) → render them directly (backward compat)
  if (hasDefaultFilters) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Filter and explore sessions across all projects.
            </p>
          </div>
          <DashboardClient viewName="default" />
          {hasDefaultAggregates && (
            <div className="mt-8">
              <AggregateClient viewName="default" />
            </div>
          )}
        </div>
      </main>
    );
  }

  // Nothing registered → empty state
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Dashboard</h2>
        </div>
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <p className="text-muted-foreground mb-2">
            No dashboard views or filters are registered.
          </p>
          <p className="text-sm text-muted-foreground">
            Use <code className="text-foreground bg-muted px-1 py-0.5 rounded">app.dashboard.view()</code> or{" "}
            <code className="text-foreground bg-muted px-1 py-0.5 rounded">app.dashboard.filter()</code> in
            your evals file to get started.
          </p>
        </div>
      </div>
    </main>
  );
}
