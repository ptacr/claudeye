"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Play,
  Clock,
  Database,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { runEnrichments } from "@/app/actions/run-enrichments";
import { runSubagentEnrichments } from "@/app/actions/run-subagent-enrichments";
import type { EnrichRunSummary, EnrichRunResult } from "@/lib/evals/enrich-types";
import type { EnrichActionResult } from "@/app/actions/run-enrichments";
import type { SubagentEnrichActionResult } from "@/app/actions/run-subagent-enrichments";

interface EnrichmentResultsPanelProps {
  projectName: string;
  sessionId: string;
  agentId?: string;
  subagentType?: string;
  subagentDescription?: string;
  compact?: boolean;
  /** Pre-fetched result from batched dashboard call. null = loading, undefined = fetch independently. */
  initialResult?: EnrichActionResult | SubagentEnrichActionResult | null;
}

function formatValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function EnricherGroup({ result }: { result: EnrichRunResult }) {
  if (result.error) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-sm font-mono font-medium">{result.name}</span>
          <span className="text-xs text-yellow-500 truncate" title={result.error}>
            {result.error}
          </span>
        </div>
      </div>
    );
  }

  const entries = Object.entries(result.data);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-medium">{result.name}</span>
        <span className="text-xs text-muted-foreground">{result.durationMs}ms</span>
      </div>
      <div className="grid grid-cols-1 gap-y-1 pl-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-2 min-w-0 flex-wrap">
            <span className="text-xs font-semibold text-primary/70 shrink-0">{key}:</span>
            <span className="text-sm font-mono break-all" title={String(value)}>
              {formatValue(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EnrichmentResultsPanel({ projectName, sessionId, agentId, subagentType, subagentDescription, compact, initialResult }: EnrichmentResultsPanelProps) {
  const [summary, setSummary] = useState<EnrichRunSummary | null>(null);
  const [loading, setLoading] = useState(initialResult == null);
  const [error, setError] = useState<string | null>(null);
  const [noEnrichers, setNoEnrichers] = useState(false);
  const [cached, setCached] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (forceRefresh = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = agentId
        ? await runSubagentEnrichments(projectName, sessionId, agentId, subagentType, subagentDescription, forceRefresh)
        : await runEnrichments(projectName, sessionId, forceRefresh);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setError(result.error);
      } else if (!result.hasEnrichers) {
        setNoEnrichers(true);
      } else {
        setSummary(result.summary);
        setCached(result.cached);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to run enrichments");
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
      ("hasEnrichers" in initialResult && !initialResult.hasEnrichers) ||
      ("hasEnrichers" in initialResult === false)
    ) {
      setNoEnrichers(true);
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

  // No enrichers registered — render nothing
  if (noEnrichers) return null;

  const panelPadding = compact ? "p-2.5" : "p-4";
  const fontSize = compact ? "text-xs" : "text-sm";

  // Loading state before first result
  if (loading && !summary) {
    return (
      <div className={`bg-card border border-border rounded-lg ${panelPadding}`}>
        <div className={`flex items-center gap-2 ${fontSize} text-muted-foreground`}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          Running enrichments...
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
          <Database className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Enrichment Data</span>
        </button>
        <div className="flex items-center gap-2">
          {summary.errorCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-yellow-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{summary.errorCount} errored</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{summary.totalDurationMs}ms</span>
            {cached && (
              <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                cached
              </span>
            )}
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

      {/* Enricher groups (collapsible) */}
      {!collapsed && (
        <div className="space-y-3 divide-y divide-border/50">
          {visibleResults.map((result) => (
            <div key={result.name} className="pt-2 first:pt-0">
              <EnricherGroup result={result} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
