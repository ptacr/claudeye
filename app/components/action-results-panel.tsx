"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Play,
  Zap,
  RefreshCw,
  ChevronDown,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { checkActionCacheAndList } from "@/app/actions/check-action-cache";
import { queueAndProcessAction } from "@/app/actions/queue-session-action";
import type { ActionRunResult } from "@/lib/evals/action-types";

interface ActionResultsPanelProps {
  projectName: string;
  sessionId: string;
  agentId?: string;
  subagentType?: string;
  subagentDescription?: string;
  compact?: boolean;
}

type ActionItemState =
  | { status: "idle"; name: string }
  | { status: "loading"; name: string }
  | { status: "done"; name: string; result: ActionRunResult; cached: boolean }
  | { status: "error"; name: string; error: string };

function ActionLoadingRow({ name }: { name: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
        <span className="text-sm font-mono font-medium text-muted-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">running...</span>
      </div>
      <div className="pl-1 space-y-1">
        <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
        <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

function ActionErrorRow({ name, error }: { name: string; error: string }) {
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

function ActionIdleRow({ name, onRun, disabled }: { name: string; onRun: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="text-sm font-mono font-medium text-muted-foreground">{name}</span>
        <span className="text-[10px] text-muted-foreground/50">not run</span>
      </div>
      <button
        onClick={onRun}
        disabled={disabled}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        <Play className="w-2.5 h-2.5" />
        Run
      </button>
    </div>
  );
}

function ActionResultGroup({ result, cached }: { result: ActionRunResult; cached: boolean }) {
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

  const statusIcon = result.status === "success"
    ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
    : <XCircle className="w-3.5 h-3.5 text-red-500" />;

  const dataEntries = result.data ? Object.entries(result.data) : [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="text-sm font-mono font-medium">{result.name}</span>
        <span className="text-xs text-muted-foreground">{result.durationMs}ms</span>
        {cached && (
          <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1 py-0.5 rounded">
            cached
          </span>
        )}
      </div>

      {result.message && (
        <p className="text-xs text-muted-foreground pl-1">{result.message}</p>
      )}

      {result.output && (
        <pre className="text-sm font-mono bg-muted/50 rounded px-2.5 py-2 whitespace-pre-wrap break-words text-foreground/90 max-h-64 overflow-y-auto">
          {result.output}
        </pre>
      )}

      {dataEntries.length > 0 && (
        <div className="grid grid-cols-1 gap-y-1 pl-1">
          {dataEntries.map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-2 min-w-0 flex-wrap">
              <span className="text-xs font-semibold text-primary/70 shrink-0">{key}:</span>
              <span className="text-sm font-mono break-all" title={typeof value === "object" ? JSON.stringify(value) : String(value)}>
                {typeof value === "boolean"
                  ? (value ? "Yes" : "No")
                  : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActionResultsPanel({ projectName, sessionId, agentId, subagentType, subagentDescription, compact }: ActionResultsPanelProps) {
  const [items, setItems] = useState<ActionItemState[]>([]);
  const [probing, setProbing] = useState(true);
  const [noActions, setNoActions] = useState(false);
  const [allCached, setAllCached] = useState(false);
  const [globalRunning, setGlobalRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const contextRef = useRef(0);

  // On mount: probe cache only — do NOT auto-run uncached actions
  useEffect(() => {
    const ctx = ++contextRef.current;
    setProbing(true);
    setError(null);
    setNoActions(false);
    setItems([]);

    checkActionCacheAndList(projectName, sessionId, agentId, subagentType).then(probe => {
      if (ctx !== contextRef.current) return;
      if (!probe.ok) { setError(probe.error); setProbing(false); return; }
      if (!probe.hasActions) { setNoActions(true); setProbing(false); return; }

      // Show cached results as done, uncached as idle (not loading — manual trigger only)
      const initial: ActionItemState[] = probe.names.map(name => {
        const cachedResult = probe.cachedResults.find(r => r.name === name);
        return cachedResult
          ? { status: "done" as const, name, result: cachedResult, cached: true }
          : { status: "idle" as const, name };
      });
      setItems(initial);
      setAllCached(probe.uncachedNames.length === 0);
      setProbing(false);
    }).catch(err => {
      if (ctx !== contextRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load actions");
      setProbing(false);
    });

    return () => { /* ctx check handles staleness */ };
  }, [projectName, sessionId, agentId, subagentType]);

  // Run a single action
  const runSingle = useCallback(async (actionName: string, forceRefresh: boolean = false) => {
    const ctx = contextRef.current;
    setItems(prev => prev.map(i => i.name === actionName ? { status: "loading", name: actionName } : i));
    const subagent = agentId ? { agentId, subagentType, subagentDescription } : undefined;
    try {
      const result = await queueAndProcessAction(projectName, sessionId, actionName, forceRefresh, subagent);
      if (ctx !== contextRef.current) return;
      if (!result.ok && result.error === "__queued__") {
        setItems(prev => prev.map(i => i.name === actionName ? { status: "idle", name: actionName } : i));
        return;
      }
      if (result.ok) {
        setItems(prev => prev.map(i => i.name === actionName
          ? { status: "done", name: actionName, result: result.result, cached: false }
          : i
        ));
      } else {
        setItems(prev => prev.map(i => i.name === actionName
          ? { status: "error", name: actionName, error: result.error }
          : i
        ));
      }
    } catch (e) {
      if (ctx !== contextRef.current) return;
      setItems(prev => prev.map(i =>
        i.name === actionName ? { status: "error", name: actionName, error: e instanceof Error ? e.message : "Failed" } : i
      ));
    }
  }, [projectName, sessionId, agentId, subagentType, subagentDescription]);

  // Run All handler
  const runAll = useCallback(async () => {
    const ctx = contextRef.current;
    setGlobalRunning(true);
    const actionNames = items.map(i => i.name);
    setItems(prev => prev.map(i => ({ status: "loading" as const, name: i.name })));
    const subagent = agentId ? { agentId, subagentType, subagentDescription } : undefined;
    try {
      await Promise.all(actionNames.map(async (actionName) => {
        try {
          const result = await queueAndProcessAction(projectName, sessionId, actionName, true, subagent);
          if (ctx !== contextRef.current) return;
          if (!result.ok && result.error === "__queued__") {
            setItems(prev => prev.map(i => i.name === actionName ? { status: "idle", name: actionName } : i));
            return;
          }
          if (result.ok) {
            setItems(prev => prev.map(i => i.name === actionName
              ? { status: "done" as const, name: actionName, result: result.result, cached: false }
              : i
            ));
          } else {
            setItems(prev => prev.map(i => i.name === actionName
              ? { status: "error" as const, name: actionName, error: result.error }
              : i
            ));
          }
        } catch (e) {
          if (ctx !== contextRef.current) return;
          setItems(prev => prev.map(i => i.name === actionName
            ? { status: "error" as const, name: actionName, error: e instanceof Error ? e.message : "Failed" }
            : i
          ));
        }
      }));
      if (ctx === contextRef.current) setAllCached(false);
    } finally {
      if (ctx === contextRef.current) setGlobalRunning(false);
    }
  }, [projectName, sessionId, agentId, subagentType, subagentDescription, items]);

  // Derived header values
  const doneItems = items.filter((i): i is Extract<ActionItemState, { status: "done" }> => i.status === "done");
  const loadingCount = items.filter(i => i.status === "loading").length;
  const idleCount = items.filter(i => i.status === "idle").length;
  const errorCount = doneItems.filter(i => i.result.status === "error" || !!i.result.error).length + items.filter(i => i.status === "error").length;
  const successCount = doneItems.filter(i => i.result.status === "success" && !i.result.error).length;
  const isLoading = probing || loadingCount > 0 || globalRunning;

  // No actions registered — render nothing
  if (noActions) return null;

  const panelPadding = compact ? "p-2.5" : "p-4";
  const fontSize = compact ? "text-xs" : "text-sm";

  // Probing state
  if (probing) {
    return (
      <div className={`bg-card border border-border rounded-lg ${panelPadding}`}>
        <div className={`flex items-center gap-2 ${fontSize} text-muted-foreground`}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading actions...
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
          aria-expanded={!collapsed}
          aria-controls="action-results-content"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium">Actions</span>
        </button>
        <div className="flex items-center gap-2">
          {successCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{successCount}</span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-yellow-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{errorCount} errored</span>
            </div>
          )}
          {idleCount > 0 && !isLoading && (
            <span className="text-[10px] text-muted-foreground/50">
              {idleCount} pending
            </span>
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
            {globalRunning ? "Running..." : "Run All"}
          </button>
        </div>
      </div>

      {/* Action items (collapsible) */}
      {!collapsed && (
        <div id="action-results-content" className="space-y-3 divide-y divide-border/50">
          {visibleItems.map(item => (
            <div key={item.name} className="pt-2 first:pt-0">
              {item.status === "idle" && (
                <ActionIdleRow name={item.name} onRun={() => runSingle(item.name)} disabled={isLoading} />
              )}
              {item.status === "loading" && <ActionLoadingRow name={item.name} />}
              {item.status === "error" && <ActionErrorRow name={item.name} error={item.error} />}
              {item.status === "done" && <ActionResultGroup result={item.result} cached={item.cached} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
