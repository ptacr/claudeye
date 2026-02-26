"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Layers,
  RefreshCw,
} from "lucide-react";
import { getQueueStatusAction } from "@/app/actions/get-queue-status";
import type { QueueStatusPayload } from "@/app/actions/get-queue-status";

const POLL_INTERVAL_MS = 5000;

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function TypeBadge({ type }: { type: "eval" | "enrichment" | "action" }) {
  const colors = type === "eval"
    ? "bg-blue-500/15 text-blue-500"
    : type === "action"
      ? "bg-amber-500/15 text-amber-500"
      : "bg-purple-500/15 text-purple-500";
  return (
    <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${colors}`}>
      {type.toUpperCase()}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={`w-2 h-2 rounded-full ${
          active ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
        }`}
      />
      <span className="text-muted-foreground">
        {active ? "Active" : "Inactive"}
      </span>
    </span>
  );
}

export default function QueueStatusPanel() {
  const [status, setStatus] = useState<QueueStatusPayload | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const data = await getQueueStatusAction();
        if (mountedRef.current) setStatus(data);
      } catch {
        // Silently ignore polling errors
      }
    };

    const startPolling = () => {
      if (intervalId) return;
      poll();
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const pendingCount = status?.pending.length ?? 0;
  const processingCount = status?.processing.length ?? 0;
  const errorCount = status?.recentErrors.length ?? 0;

  // Hide when inactive
  if (
    !status ||
    (pendingCount === 0 &&
      processingCount === 0 &&
      !status.backgroundRunning &&
      errorCount === 0)
  ) {
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          aria-expanded={!collapsed}
        >
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Queue Status</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs">
            {pendingCount > 0 && (
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{pendingCount}</span> queued
              </span>
            )}
            {processingCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="font-medium text-foreground">{processingCount}</span> processing
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-500">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-medium">{errorCount}</span>
              </span>
            )}
          </div>
          <StatusDot active={status.backgroundRunning} />
        </div>
      </div>

      {/* Expanded content */}
      {!collapsed && (
        <div className="mt-3 space-y-3">
          {/* Processing items */}
          {processingCount > 0 && (
            <div className="border border-border/50 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground">
                    <th className="text-left px-3 py-1.5 font-medium">Type</th>
                    <th className="text-left px-3 py-1.5 font-medium">Item</th>
                    <th className="text-left px-3 py-1.5 font-medium">Session</th>
                    <th className="text-left px-3 py-1.5 font-medium">Status</th>
                    <th className="text-right px-3 py-1.5 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {status.processing.map((entry) => (
                    <tr key={entry.key} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5"><TypeBadge type={entry.type} /></td>
                      <td className="px-3 py-1.5 font-mono truncate max-w-[120px]">{entry.itemName}</td>
                      <td className="px-3 py-1.5 font-mono truncate max-w-[120px]" title={entry.sessionId}>
                        {entry.sessionId.length > 12 ? `${entry.sessionId.slice(0, 12)}...` : entry.sessionId}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1 text-primary">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          processing
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{timeAgo(entry.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pending items */}
          {pendingCount > 0 && (
            <div className="border border-border/50 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground">
                    <th className="text-left px-3 py-1.5 font-medium">Type</th>
                    <th className="text-left px-3 py-1.5 font-medium">Item</th>
                    <th className="text-left px-3 py-1.5 font-medium">Session</th>
                    <th className="text-left px-3 py-1.5 font-medium">Priority</th>
                    <th className="text-right px-3 py-1.5 font-medium">Queued</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {status.pending.map((entry) => (
                    <tr key={entry.key} className="hover:bg-muted/20">
                      <td className="px-3 py-1.5"><TypeBadge type={entry.type} /></td>
                      <td className="px-3 py-1.5 font-mono truncate max-w-[120px]">{entry.itemName}</td>
                      <td className="px-3 py-1.5 font-mono truncate max-w-[120px]" title={entry.sessionId}>
                        {entry.sessionId.length > 12 ? `${entry.sessionId.slice(0, 12)}...` : entry.sessionId}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          entry.priority <= 0
                            ? "bg-blue-500/15 text-blue-500"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {entry.priorityLabel}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{timeAgo(entry.addedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No items */}
          {pendingCount === 0 && processingCount === 0 && (
            <p className="text-xs text-muted-foreground">No items currently in queue.</p>
          )}

          {/* Recent errors */}
          {status.recentErrors.length > 0 && (
            <div>
              <button
                onClick={() => setErrorsExpanded((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs text-yellow-500 hover:opacity-80 transition-opacity"
                aria-expanded={errorsExpanded}
              >
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${errorsExpanded ? "" : "-rotate-90"}`}
                />
                <AlertTriangle className="w-3 h-3" />
                <span>{status.recentErrors.length} recent {status.recentErrors.length === 1 ? "error" : "errors"}</span>
              </button>
              {errorsExpanded && (
                <div className="mt-1.5 space-y-1">
                  {status.recentErrors.map((err, i) => (
                    <div
                      key={`${err.key}-${err.at}-${i}`}
                      className="text-xs bg-muted/30 rounded px-2 py-1 flex items-start gap-2"
                    >
                      <span className="font-mono text-muted-foreground shrink-0">{err.key}</span>
                      <span className="text-yellow-500 break-all">{err.error}</span>
                      <span className="text-muted-foreground shrink-0 ml-auto">{timeAgo(err.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
