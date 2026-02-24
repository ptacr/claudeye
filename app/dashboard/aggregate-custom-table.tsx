"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { AggregateTableRow } from "@/lib/evals/dashboard-types";

type SortDir = "asc" | "desc";

interface Props {
  rows: AggregateTableRow[];
  columns: string[];
}

export default function AggregateCustomTable({ rows, columns }: Props) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No data returned from reduce function.</p>;
  }

  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const sorted = sortCol
    ? [...rows].sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        const av = a[sortCol];
        const bv = b[sortCol];
        if (av === undefined && bv === undefined) return 0;
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        if (typeof av === "boolean" && typeof bv === "boolean") return (Number(av) - Number(bv)) * dir;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      })
    : rows;

  function formatValue(v: unknown): string {
    if (v === undefined || v === null) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") {
      if (Number.isInteger(v)) return v.toLocaleString();
      return v.toFixed(4);
    }
    return String(v);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                onClick={() => toggleSort(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col}
                  <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-foreground">
                  {formatValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
