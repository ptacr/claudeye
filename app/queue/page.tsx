"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import type { QueueEntry, ProcessingEntry, CompletedEntry } from "@/lib/eval-queue";

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

type Tab = "pending" | "processing" | "completed";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function TypeBadge({ type }: { type: "eval" | "enrichment" | "action" }) {
  const colors = type === "eval"
    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    : type === "action"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-medium ${colors}`}>
      {type.toUpperCase()}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  const isHigh = priority <= 0;
  return (
    <span
      className={`text-[0.6rem] font-medium px-1.5 py-0.5 rounded ${
        isHigh
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isHigh ? "HIGH" : "LOW"}
    </span>
  );
}

function SessionLink({ projectName, sessionId }: { projectName: string; sessionId: string }) {
  return (
    <Link
      href={`/project/${encodeURIComponent(projectName)}/session/${encodeURIComponent(sessionId)}`}
      className="text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-[200px]"
    >
      {sessionId}
    </Link>
  );
}

export default function QueuePage() {
  const [data, setData] = useState<QueueStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("processing");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/queue-status", { cache: "no-store" });
      if (res.ok) {
        const fresh = await res.json();
        setData(fresh);
        setError(null);
      } else {
        setError(`Failed to fetch: ${res.status}`);
      }
    } catch {
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchStatus, 0);
    const id = setInterval(fetchStatus, 3000);
    return () => { clearTimeout(timer); clearInterval(id); };
  }, [fetchStatus]);

  const display = data;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "pending", label: "In Queue", count: display?.pending.length ?? 0 },
    { key: "processing", label: "Processing", count: display?.processing.length ?? 0 },
    { key: "completed", label: "Processed", count: display?.completed.length ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2">Queue Details</h1>
      </div>

      {/* Error state */}
      {error && !display && (
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-sm text-destructive mb-2">{error}</p>
          <button
            onClick={fetchStatus}
            className="text-xs text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {!display && !error && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {display && (
        <div className="space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-border">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-muted-foreground">({t.count})</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {tab === "pending" && (
              display.pending.length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground text-center">No items in queue.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border bg-muted/30">
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Session</th>
                        <th className="px-3 py-2 font-medium">Priority</th>
                        <th className="px-3 py-2 font-medium text-right">Queued</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {display.pending.map((entry) => (
                        <tr key={entry.key} className="hover:bg-muted/20">
                          <td className="px-3 py-2"><TypeBadge type={entry.type} /></td>
                          <td className="px-3 py-2 font-mono text-foreground">{entry.itemName}</td>
                          <td className="px-3 py-2"><SessionLink projectName={entry.projectName} sessionId={entry.sessionId} /></td>
                          <td className="px-3 py-2"><PriorityBadge priority={entry.priority} /></td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{timeAgo(entry.addedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === "processing" && (
              display.processing.length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground text-center">No items currently processing.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border bg-muted/30">
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Session</th>
                        <th className="px-3 py-2 font-medium">Priority</th>
                        <th className="px-3 py-2 font-medium text-right">Started</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {display.processing.map((entry) => (
                        <tr key={entry.key} className="hover:bg-muted/20">
                          <td className="px-3 py-2"><TypeBadge type={entry.type} /></td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <RefreshCw className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />
                              <span className="font-mono text-foreground">{entry.itemName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2"><SessionLink projectName={entry.projectName} sessionId={entry.sessionId} /></td>
                          <td className="px-3 py-2"><PriorityBadge priority={entry.priority} /></td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{timeAgo(entry.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === "completed" && (
              display.completed.length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground text-center">No recently completed items.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border bg-muted/30">
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Session</th>
                        <th className="px-3 py-2 font-medium">Duration</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {display.completed.map((item, i) => (
                        <tr key={`${item.key}-${item.completedAt}-${i}`} className="hover:bg-muted/20">
                          <td className="px-3 py-2"><TypeBadge type={item.type} /></td>
                          <td className="px-3 py-2 font-mono text-foreground">{item.itemName}</td>
                          <td className="px-3 py-2"><SessionLink projectName={item.projectName} sessionId={item.sessionId} /></td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDuration(item.durationMs)}</td>
                          <td className="px-3 py-2">
                            {item.success ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{timeAgo(item.completedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Recent errors */}
          {display.recentErrors.length > 0 && (
            <section className="bg-card border border-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">
                Recent Errors
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({display.recentErrors.length})
                </span>
              </h2>
              <div className="space-y-1">
                {display.recentErrors.map((err, i) => (
                  <div
                    key={`${err.key}-${err.at}-${i}`}
                    className="text-xs bg-muted/30 rounded px-2 py-1 flex items-start gap-2"
                  >
                    <span className="font-mono text-muted-foreground shrink-0">{err.key}</span>
                    <span className="text-red-500 break-all">{err.error}</span>
                    <span className="text-muted-foreground shrink-0 ml-auto">{timeAgo(err.at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
