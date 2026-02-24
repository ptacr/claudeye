"use client";

import AggregateCustomTable from "./aggregate-custom-table";
import type { AggregatePayload } from "@/lib/evals/dashboard-types";

interface Props {
  aggregate: AggregatePayload["aggregates"][number];
}

export default function AggregateSection({ aggregate }: Props) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h4 className="text-sm font-medium text-foreground mb-3">{aggregate.label}</h4>
      <AggregateCustomTable
        rows={aggregate.rows}
        columns={aggregate.columns}
      />
    </div>
  );
}
