/** Named dashboard view route — shows filters for a specific view. */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listDashboardViews } from "@/app/actions/list-dashboard-views";
import DashboardClient from "../dashboard-client";
import AggregateClient from "../aggregate-client";

export const dynamic = "force-dynamic";

export default async function ViewPage({ params }: { params: Promise<{ viewName: string }> }) {
  const { viewName } = await params;
  const decodedViewName = decodeURIComponent(viewName);

  const result = await listDashboardViews();
  const viewInfo =
    result.ok ? result.views.find((v) => v.name === decodedViewName) : undefined;
  const label = viewInfo?.label ?? decodedViewName;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto p-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            All views
          </Link>
          <h2 className="text-2xl font-semibold text-foreground">{label}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Filter and explore sessions across all projects.
          </p>
        </div>
        <DashboardClient viewName={decodedViewName} />
        {viewInfo && viewInfo.aggregateCount > 0 && (
          <div className="mt-8">
            <AggregateClient viewName={decodedViewName} />
          </div>
        )}
      </div>
    </main>
  );
}
