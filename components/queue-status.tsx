"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ListOrdered } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProcessingEntry, QueueEntry, CompletedEntry } from "@/lib/eval-queue";

interface QueueError {
  key: string;
  error: string;
  at: number;
}

interface QueueStatusData {
  pending: QueueEntry[];
  processing: ProcessingEntry[];
  completed: CompletedEntry[];
  scannedAt: number;
  backgroundRunning: boolean;
  recentErrors: QueueError[];
}

function TypeBadge({ type }: { type: "eval" | "enrichment" | "action" }) {
  const colors = type === "eval"
    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    : type === "action"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
  return (
    <span className={`inline-flex items-center rounded px-1 py-0.5 text-[0.6rem] font-medium leading-none ${colors}`}>
      {type.toUpperCase()}
    </span>
  );
}

export const QueueStatus: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<QueueStatusData | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/queue-status", { cache: "no-store" });
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Silently ignore fetch errors
    }
  }, []);

  // Single adaptive poll: 2s while open, 5s while closed
  useEffect(() => {
    const interval = open ? 2000 : 5000;
    const timer = setTimeout(fetchStatus, 0);
    const id = setInterval(fetchStatus, interval);
    return () => { clearTimeout(timer); clearInterval(id); };
  }, [open, fetchStatus]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    },
    [open],
  );

  const pendingCount = data?.pending.length ?? 0;
  const processingCount = data?.processing.length ?? 0;
  const completedCount = data?.completed.length ?? 0;
  const activeCount = pendingCount + processingCount;

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <ListOrdered className="h-4 w-4" />
        {activeCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-medium text-primary-foreground">
            {activeCount}
          </span>
        ) : completedCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[0.6rem] font-medium text-muted-foreground">
            {completedCount}
          </span>
        ) : null}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-border bg-card shadow-lg z-50">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-medium text-foreground">Queue</p>
            {data && (
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">
                {pendingCount} queued &middot; {processingCount} processing &middot; {completedCount} completed
              </p>
            )}
          </div>

          {/* Content */}
          <div className="max-h-64 overflow-y-auto">
            {!data ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">Loading...</p>
            ) : data.processing.length === 0 && data.pending.length === 0 && data.completed.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">Queue is empty</p>
            ) : (
              <div className="py-1">
                {/* Processing items (max 7) */}
                {data.processing.slice(0, 7).map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                    <TypeBadge type={entry.type} />
                    <span className="text-foreground truncate flex-1 font-mono text-[0.65rem]">{entry.itemName}</span>
                  </div>
                ))}
                {data.processing.length > 7 && (
                  <p className="px-3 py-1 text-[0.6rem] text-muted-foreground">
                    ...and {data.processing.length - 7} more
                  </p>
                )}

                {/* Pending items (max 5) */}
                {data.pending.slice(0, 5).map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                    <TypeBadge type={entry.type} />
                    <span className="text-muted-foreground truncate flex-1 font-mono text-[0.65rem]">{entry.itemName}</span>
                    <span
                      className={`text-[0.6rem] font-medium flex-shrink-0 ${
                        entry.priority <= 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {entry.priority <= 0 ? "HIGH" : "LOW"}
                    </span>
                  </div>
                ))}
                {data.pending.length > 5 && (
                  <p className="px-3 py-1 text-[0.6rem] text-muted-foreground">
                    ...and {data.pending.length - 5} more queued
                  </p>
                )}

                {/* Recently completed items (max 5) */}
                {data.completed.length > 0 && (
                  <>
                    {(data.processing.length > 0 || data.pending.length > 0) && (
                      <div className="border-t border-border/50 my-1" />
                    )}
                    <p className="px-3 pt-1 pb-0.5 text-[0.6rem] font-medium text-muted-foreground">Recently completed</p>
                    {data.completed.slice(0, 5).map((item, i) => (
                      <div
                        key={`${item.key}-${item.completedAt}-${i}`}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${item.success ? "bg-green-500" : "bg-red-500"}`} />
                        <TypeBadge type={item.type} />
                        <span className="text-muted-foreground truncate flex-1 font-mono text-[0.65rem]">{item.itemName}</span>
                      </div>
                    ))}
                    {data.completed.length > 5 && (
                      <p className="px-3 py-1 text-[0.6rem] text-muted-foreground">
                        ...and {data.completed.length - 5} more completed
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Errors footer */}
          {data && data.recentErrors.length > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <p className="text-[0.6rem] text-red-600 dark:text-red-400">
                {data.recentErrors.length} recent error{data.recentErrors.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* View details link */}
          <div className="px-3 py-2 border-t border-border text-center">
            <Link
              href="/queue"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setOpen(false)}
            >
              View details
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
