"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Play,
  Database,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { checkEnrichmentCacheAndList } from "@/app/actions/check-enrichment-cache";
import { queueAndProcessEnrichment } from "@/app/actions/queue-session-enrichment";
import type { EnrichRunResult } from "@/lib/evals/enrich-types";

interface EnrichmentResultsPanelProps {
  projectName: string;
  sessionId: string;
  agentId?: string;
  subagentType?: string;
  subagentDescription?: string;
  compact?: boolean;
}

type EnrichItemState =
  | { status: "loading"; name: string }
  | { status: "done"; name: string; result: EnrichRunResult; cached: boolean }
  | { status: "error"; name: string; error: string };

function formatValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function EnrichmentLoadingRow({ name }: { name: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-medium text-muted-foreground">{name}</span>
        <div className="w-10 h-3 bg-muted rounded animate-pulse" />
      </div>
      <div className="pl-1 space-y-1">
        <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
        <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

function EnrichmentErrorRow({ name, error }: { name: string; error: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
        <span className="text-sm font-mono font-medium">{name}</span>
        <span className="text-xs text-yellow-500 truncate">{error}</span>
      </div>
    </div>
  );
}

function EnricherGroup({ result, cached }: { result: EnrichRunResult; cached: boolean }) {
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
        {cached && (
          <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1 py-0.5 rounded">
            cached
          </span>
        )}
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

export default function EnrichmentResultsPanel({ projectName, sessionId, agentId, subagentType, subagentDescription, compact }: EnrichmentResultsPanelProps) {
  const [items, setItems] = useState<EnrichItemState[]>([]);
  const [probing, setProbing] = useState(true);
  const [noEnrichers, setNoEnrichers] = useState(false);
  const [allCached, setAllCached] = useState(false);
  const [globalRunning, setGlobalRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const mountedRef = useRef(true);

  // Two-phase loading on mount
  useEffect(() => {
    mountedRef.current = true;
    let stale = false;

    checkEnrichmentCacheAndList(projectName, sessionId, agentId, subagentType).then(probe => {
      if (stale || !mountedRef.current) return;
      if (!probe.ok) { setError(probe.error); setProbing(false); return; }
      if (!probe.hasEnrichers) { setNoEnrichers(true); setProbing(false); return; }

      // Phase 1: show names immediately — cached results filled in, rest as loading
      const initial: EnrichItemState[] = probe.names.map(name => {
        const cachedResult = probe.cachedResults.find(r => r.name === name);
        return cachedResult
          ? { status: "done" as const, name, result: cachedResult, cached: true }
          : { status: "loading" as const, name };
      });
      setItems(initial);
      setAllCached(probe.uncachedNames.length === 0);
      setProbing(false);

      // Phase 2: process uncached enrichments in parallel, per-item (unified queue path)
      if (probe.uncachedNames.length > 0) {
        const subagent = agentId ? { agentId, subagentType, subagentDescription } : undefined;
        Promise.all(probe.uncachedNames.map(async (enricherName) => {
          try {
            const result = await queueAndProcessEnrichment(projectName, sessionId, enricherName, false, subagent);
            if (stale || !mountedRef.current) return;
            if (!result.ok && result.error === "__queued__") {
              // Leave item in loading state — it will complete via the queue
              return;
            }
            if (result.ok) {
              setItems(prev => prev.map(i => i.name === enricherName
                ? { status: "done", name: enricherName, result: result.result, cached: false }
                : i
              ));
            } else {
              setItems(prev => prev.map(i => i.name === enricherName
                ? { status: "error", name: enricherName, error: result.error }
                : i
              ));
            }
          } catch (e) {
            if (stale || !mountedRef.current) return;
            setItems(prev => prev.map(i =>
              i.name === enricherName ? { status: "error", name: enricherName, error: e instanceof Error ? e.message : "Failed" } : i
            ));
          }
        }));
      }
    }).catch(err => {
      if (stale || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load enrichments");
      setProbing(false);
    });

    return () => { stale = true; mountedRef.current = false; };
  }, [projectName, sessionId, agentId, subagentType, subagentDescription]);

  // Re-run All handler
  const runAll = useCallback(async () => {
    setGlobalRunning(true);
    setItems(prev => prev.map(i => ({ status: "loading" as const, name: i.name })));
    const subagent = agentId ? { agentId, subagentType, subagentDescription } : undefined;
    try {
      const enricherNames = items.map(i => i.name);
      await Promise.all(enricherNames.map(async (enricherName) => {
        try {
          const result = await queueAndProcessEnrichment(projectName, sessionId, enricherName, true, subagent);
          if (!mountedRef.current) return;
          if (!result.ok && result.error === "__queued__") return;
          if (result.ok) {
            setItems(prev => prev.map(i => i.name === enricherName
              ? { status: "done" as const, name: enricherName, result: result.result, cached: false }
              : i
            ));
          } else {
            setItems(prev => prev.map(i => i.name === enricherName
              ? { status: "error" as const, name: enricherName, error: result.error }
              : i
            ));
          }
        } catch (e) {
          if (!mountedRef.current) return;
          setItems(prev => prev.map(i => i.name === enricherName
            ? { status: "error" as const, name: enricherName, error: e instanceof Error ? e.message : "Failed" }
            : i
          ));
        }
      }));
      if (mountedRef.current) setAllCached(false);
    } finally {
      if (mountedRef.current) setGlobalRunning(false);
    }
  }, [projectName, sessionId, agentId, subagentType, subagentDescription, items]);

  // Derived header values
  const doneItems = items.filter((i): i is Extract<EnrichItemState, { status: "done" }> => i.status === "done");
  const loadingCount = items.filter(i => i.status === "loading").length;
  const errorCount = doneItems.filter(i => !!i.result.error).length + items.filter(i => i.status === "error").length;
  const isLoading = probing || loadingCount > 0 || globalRunning;

  // No enrichers registered — render nothing
  if (noEnrichers) return null;

  const panelPadding = compact ? "p-2.5" : "p-4";
  const fontSize = compact ? "text-xs" : "text-sm";

  // Probing state (brief, before names arrive)
  if (probing) {
    return (
      <div className={`bg-card border border-border rounded-lg ${panelPadding}`}>
        <div className={`flex items-center gap-2 ${fontSize} text-muted-foreground`}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading enrichments...
        </div>
      </div>
    );
  }

  // Error state before any items loaded
  if (error && items.length === 0) {
    return (
      <div className={`bg-card border border-border rounded-lg ${panelPadding}`}>
        <div className={`flex items-center gap-2 ${fontSize} text-destructive`}>
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  // Filter visible items (exclude skipped done items)
  const visibleItems = items.filter(i => !(i.status === "done" && i.result.skipped));
  if (visibleItems.length === 0 && !isLoading) return null;

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
          {errorCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-yellow-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{errorCount} errored</span>
            </div>
          )}
          {loadingCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{loadingCount} running...</span>
            </div>
          )}
          {allCached && !isLoading && (
            <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
              cached
            </span>
          )}
          <button
            onClick={() => runAll()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {globalRunning ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            {globalRunning ? "Running..." : "Re-run"}
          </button>
        </div>
      </div>

      {/* Enricher groups (collapsible) */}
      {!collapsed && (
        <div className="space-y-3 divide-y divide-border/50">
          {visibleItems.map(item => (
            <div key={item.name} className="pt-2 first:pt-0">
              {item.status === "loading" && <EnrichmentLoadingRow name={item.name} />}
              {item.status === "error" && <EnrichmentErrorRow name={item.name} error={item.error} />}
              {item.status === "done" && <EnricherGroup result={item.result} cached={item.cached} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
