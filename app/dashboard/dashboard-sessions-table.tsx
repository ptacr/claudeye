/** Dashboard sessions table — shows filtered sessions with dynamic filter columns. */
"use client";

import Link from "next/link";
import { File } from "lucide-react";
import PaginationControls from "@/app/components/pagination-controls";
import type { DashboardSessionRow, FilterMeta, FilterValue } from "@/lib/evals/dashboard-types";

interface DashboardSessionsTableProps {
  sessions: DashboardSessionRow[];
  filterMeta: FilterMeta[];
  totalCount: number;
  matchingCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function formatFilterValue(value: FilterValue | undefined): string {
  if (value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function DashboardSessionsTable({
  sessions,
  filterMeta,
  totalCount,
  matchingCount,
  page,
  pageSize,
  onPageChange,
}: DashboardSessionsTableProps) {
  const totalPages = Math.ceil(matchingCount / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + sessions.length, matchingCount);

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {matchingCount === 0 ? (
          "No sessions match the current filters."
        ) : (
          <>
            Showing {startIndex + 1}-{endIndex} of {matchingCount} sessions
            {matchingCount !== totalCount && (
              <span className="ml-1">(filtered from {totalCount} total)</span>
            )}
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-foreground w-12">
                  <span className="sr-only">Icon</span>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                  Project
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                  Session ID
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                  Modified
                </th>
                {filterMeta.map((meta) => (
                  <th
                    key={meta.name}
                    scope="col"
                    className="px-4 py-3 text-left text-sm font-semibold text-foreground"
                  >
                    {meta.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + filterMeta.length}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No sessions found matching the filters.
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr
                    key={`${session.projectName}/${session.sessionId}`}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <File className="w-5 h-5 text-primary" />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      <Link
                        href={`/project/${encodeURIComponent(session.projectName)}`}
                        className="hover:text-primary transition-colors"
                      >
                        {session.projectName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm max-w-xs">
                      <Link
                        href={`/project/${encodeURIComponent(session.projectName)}/session/${encodeURIComponent(session.sessionId)}`}
                        className="font-semibold text-foreground hover:text-primary transition-colors break-words break-all"
                      >
                        {session.sessionId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {session.lastModifiedFormatted}
                    </td>
                    {filterMeta.map((meta) => (
                      <td
                        key={meta.name}
                        className="px-4 py-3 text-sm text-muted-foreground"
                      >
                        {formatFilterValue(session.filterValues[meta.name])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {matchingCount > 0 && totalPages > 1 && (
          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
}
