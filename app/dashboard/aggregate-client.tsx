"use client";

import { useState, useEffect, useCallback } from "react";
import { computeAggregates } from "@/app/actions/compute-aggregates";
import type { AggregatePayload } from "@/lib/evals/dashboard-types";
import AggregateSection from "./aggregate-section";
import { Loader2 } from "lucide-react";

export default function AggregateClient({ viewName }: { viewName: string }) {
  const [payload, setPayload] = useState<AggregatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAggregates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await computeAggregates(viewName);
      if (!result.ok) {
        setError(result.error);
      } else if (result.hasAggregates) {
        setPayload(result.payload);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [viewName]);

  useEffect(() => {
    fetchAggregates();
  }, [fetchAggregates]);

  if (loading && !payload) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-primary animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Computing aggregates...</span>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
        <p className="text-sm text-destructive font-medium">Failed to compute aggregates</p>
        <p className="text-sm text-destructive/80 mt-1">{error}</p>
        <button
          onClick={() => fetchAggregates()}
          className="mt-3 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!payload || payload.aggregates.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Aggregates</h3>
        <span className="text-xs text-muted-foreground">
          {payload.totalSessions} sessions, {payload.totalDurationMs}ms
          {loading && " (updating...)"}
        </span>
      </div>
      {payload.aggregates.map((agg) => (
        <AggregateSection key={agg.name} aggregate={agg} />
      ))}
    </div>
  );
}
