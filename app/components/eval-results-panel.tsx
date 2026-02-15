"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Clock,
  BarChart3,
  RefreshCw,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { CopyButton } from "@/app/components/copy-button";
import { runEvals } from "@/app/actions/run-evals";
import { runSubagentEvals } from "@/app/actions/run-subagent-evals";
import type { EvalRunSummary, EvalRunResult } from "@/lib/evals/types";
import type { EvalActionResult } from "@/app/actions/run-evals";
import type { SubagentEvalActionResult } from "@/app/actions/run-subagent-evals";

interface EvalResultsPanelProps {
  projectName: string;
  sessionId: string;
  agentId?: string;
  subagentType?: string;
  subagentDescription?: string;
  compact?: boolean;
  /** Pre-fetched result from batched dashboard call. null = loading, undefined = fetch independently. */
  initialResult?: EvalActionResult | SubagentEvalActionResult | null;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[80px]">
        <div
          className={`h-full rounded-full transition-all ${
            score >= 0.8
              ? "bg-green-500"
              : score >= 0.5
                ? "bg-yellow-500"
                : "bg-red-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8">{pct}%</span>
    </div>
  );
}

function StatusIcon({ result }: { result: EvalRunResult }) {
  if (result.error) {
    return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  }
  if (result.pass) {
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  }
  return <XCircle className="w-4 h-4 text-red-500" />;
}

function EvalResultRow({ result }: { result: EvalRunResult }) {
  const [expanded, setExpanded] = useState(false);
  const expandableText = result.error || result.message;
  const hasExpandableContent = !!expandableText;

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/30 transition-colors ${hasExpandableContent ? "cursor-pointer" : ""}`}
        onClick={() => hasExpandableContent && setExpanded((prev) => !prev)}
      >
        {hasExpandableContent && (
          <ChevronRight
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
        <StatusIcon result={result} />
        <span className="text-sm font-mono truncate max-w-[200px]">{result.name}</span>
        <ScoreBar score={result.score} />
        {result.error && (
          <span className="text-xs text-yellow-500 flex-1 truncate min-w-0">
            {result.error}
          </span>
        )}
        {result.message && !result.error && (
          <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">
            {result.message}
          </span>
        )}
      </div>
      {expanded && expandableText && (
        <div className="ml-10 mr-3 mb-2 relative group">
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={expandableText} />
          </div>
          <div className="p-2 pr-8 bg-muted/50 rounded text-xs whitespace-pre-wrap break-words select-text">
            {expandableText}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EvalResultsPanel({ projectName, sessionId, agentId, subagentType, subagentDescription, compact, initialResult }: EvalResultsPanelProps) {
  const [summary, setSummary] = useState<EvalRunSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noEvals, setNoEvals] = useState(false);
  const [cached, setCached] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (forceRefresh = false) => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = agentId
        ? await runSubagentEvals(projectName, sessionId, agentId, subagentType, subagentDescription, forceRefresh)
        : await runEvals(projectName, sessionId, forceRefresh);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setError(result.error);
      } else if (!result.hasEvals) {
        setNoEvals(true);
      } else {
        setSummary(result.summary);
        setCached(result.cached);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to run evals");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [projectName, sessionId, agentId, subagentType, subagentDescription]);

  // Apply pre-fetched result from dashboard batch call
  useEffect(() => {
    if (initialResult === undefined) return; // no dashboard — will fetch independently
    if (initialResult === null) return; // dashboard still loading — wait
    // Apply the result directly
    if (!initialResult.ok) {
      setError(initialResult.error);
    } else if (
      ("hasEvals" in initialResult && !initialResult.hasEvals) ||
      ("hasEvals" in initialResult === false)
    ) {
      setNoEvals(true);
    } else if ("summary" in initialResult) {
      setSummary(initialResult.summary);
      setCached(initialResult.cached);
    }
    setLoading(false);
  }, [initialResult]);

  // Auto-run on mount when no dashboard result is provided; abort on unmount
  useEffect(() => {
    if (initialResult !== undefined) return; // dashboard handles this
    run(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [run, initialResult]);

  // No evals registered — render nothing
  if (noEvals) return null;

  const panelPadding = compact ? "p-2.5" : "p-4";
  const fontSize = compact ? "text-xs" : "text-sm";

  // Loading state before first result
  if (loading && !summary) {
    return (
      <div className={`bg-card border border-border rounded-lg ${panelPadding}`}>
        <div className={`flex items-center gap-2 ${fontSize} text-muted-foreground`}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          Running evals...
        </div>
      </div>
    );
  }

  // Error state
  if (error && !summary) {
    return (
      <div className={`bg-card border border-border rounded-lg ${panelPadding}`}>
        <div className={`flex items-center gap-2 ${fontSize} text-destructive`}>
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const visibleResults = summary.results.filter((r) => !r.skipped);
  if (visibleResults.length === 0) return null;

  return (
    <div className={`bg-card border border-border rounded-lg ${panelPadding} ${collapsed ? "" : "space-y-3"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Eval Results</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="font-medium">{summary.passCount}</span>
              <span className="text-muted-foreground">passed</span>
            </div>
            {summary.failCount > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="font-medium">{summary.failCount}</span>
                <span className="text-muted-foreground">failed</span>
              </div>
            )}
            {summary.errorCount > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                <span className="font-medium">{summary.errorCount}</span>
                <span className="text-muted-foreground">errored</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{summary.totalDurationMs}ms</span>
              {cached && (
                <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                  cached
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => run(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            {loading ? "Running..." : "Re-run"}
          </button>
        </div>
      </div>

      {/* Summary bar + Results list (collapsible) */}
      {!collapsed && (
        <div className="divide-y divide-border/50">
          {visibleResults.map((result) => (
            <EvalResultRow key={result.name} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}
