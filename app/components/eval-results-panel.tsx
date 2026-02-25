"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  BarChart3,
  RefreshCw,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { CopyButton } from "@/app/components/copy-button";
import { checkEvalCacheAndList } from "@/app/actions/check-eval-cache";
import { queueAndProcessEval } from "@/app/actions/queue-session-eval";
import type { EvalRunResult } from "@/lib/evals/types";

interface EvalResultsPanelProps {
  projectName: string;
  sessionId: string;
  agentId?: string;
  subagentType?: string;
  subagentDescription?: string;
  compact?: boolean;
}

type EvalItemState =
  | { status: "loading"; name: string }
  | { status: "done"; name: string; result: EvalRunResult; cached: boolean }
  | { status: "error"; name: string; error: string };

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

function EvalLoadingRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="w-4 h-4 rounded-full bg-muted animate-pulse" />
      <span className="text-sm font-mono truncate max-w-[200px] text-muted-foreground">{name}</span>
      <div className="flex-1 h-2 bg-muted rounded-full animate-pulse max-w-[80px]" />
    </div>
  );
}

function EvalErrorRow({ name, error }: { name: string; error: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <AlertTriangle className="w-4 h-4 text-yellow-500" />
      <span className="text-sm font-mono truncate max-w-[200px]">{name}</span>
      <span className="text-xs text-yellow-500 truncate">{error}</span>
    </div>
  );
}

function EvalResultRow({
  result,
  cached,
  onRerun,
  globalLoading,
}: {
  result: EvalRunResult;
  cached: boolean;
  onRerun: (name: string) => Promise<void>;
  globalLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const expandableText = result.error || result.message;
  const hasExpandableContent = !!expandableText;

  const handleRerun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRerunning(true);
    try {
      await onRerun(result.name);
    } finally {
      setRerunning(false);
    }
  };

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
        {cached && (
          <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1 py-0.5 rounded">
            cached
          </span>
        )}
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
        <button
          onClick={handleRerun}
          disabled={rerunning || globalLoading}
          className="ml-auto flex-shrink-0 p-1 rounded hover:bg-muted/50 transition-colors disabled:opacity-50"
          title="Re-run this eval"
          aria-label={`Re-run eval ${result.name}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${rerunning ? "animate-spin" : ""}`} />
        </button>
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

export default function EvalResultsPanel({ projectName, sessionId, agentId, subagentType, subagentDescription, compact }: EvalResultsPanelProps) {
  const [items, setItems] = useState<EvalItemState[]>([]);
  const [probing, setProbing] = useState(true);
  const [noEvals, setNoEvals] = useState(false);
  const [allCached, setAllCached] = useState(false);
  const [globalRunning, setGlobalRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const mountedRef = useRef(true);

  // Two-phase loading on mount
  useEffect(() => {
    mountedRef.current = true;
    let stale = false;
    setProbing(true);
    setError(null);
    setNoEvals(false);
    setItems([]);

    checkEvalCacheAndList(projectName, sessionId, agentId, subagentType).then(probe => {
      if (stale || !mountedRef.current) return;
      if (!probe.ok) { setError(probe.error); setProbing(false); return; }
      if (!probe.hasEvals) { setNoEvals(true); setProbing(false); return; }

      // Phase 1: show names immediately — cached results filled in, rest as loading
      const initial: EvalItemState[] = probe.names.map(name => {
        const cachedResult = probe.cachedResults.find(r => r.name === name);
        return cachedResult
          ? { status: "done" as const, name, result: cachedResult, cached: true }
          : { status: "loading" as const, name };
      });
      setItems(initial);
      setAllCached(probe.uncachedNames.length === 0);
      setProbing(false);

      // Phase 2: process uncached evals in parallel, per-item (unified queue path)
      if (probe.uncachedNames.length > 0) {
        const subagent = agentId ? { agentId, subagentType, subagentDescription } : undefined;
        Promise.all(probe.uncachedNames.map(async (evalName) => {
          try {
            const result = await queueAndProcessEval(projectName, sessionId, evalName, false, subagent);
            if (stale || !mountedRef.current) return;
            if (!result.ok && result.error === "__queued__") {
              // Leave item in loading state — it will complete via the queue
              return;
            }
            if (result.ok) {
              setItems(prev => prev.map(i => i.name === evalName
                ? { status: "done", name: evalName, result: result.result, cached: false }
                : i
              ));
            } else {
              setItems(prev => prev.map(i => i.name === evalName
                ? { status: "error", name: evalName, error: result.error }
                : i
              ));
            }
          } catch (e) {
            if (stale || !mountedRef.current) return;
            setItems(prev => prev.map(i =>
              i.name === evalName ? { status: "error", name: evalName, error: e instanceof Error ? e.message : "Failed" } : i
            ));
          }
        }));
      }
    }).catch(err => {
      if (stale || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load evals");
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
      const evalNames = items.map(i => i.name);
      await Promise.all(evalNames.map(async (evalName) => {
        try {
          const result = await queueAndProcessEval(projectName, sessionId, evalName, true, subagent);
          if (!mountedRef.current) return;
          if (!result.ok && result.error === "__queued__") return;
          if (result.ok) {
            setItems(prev => prev.map(i => i.name === evalName
              ? { status: "done" as const, name: evalName, result: result.result, cached: false }
              : i
            ));
          } else {
            setItems(prev => prev.map(i => i.name === evalName
              ? { status: "error" as const, name: evalName, error: result.error }
              : i
            ));
          }
        } catch (e) {
          if (!mountedRef.current) return;
          setItems(prev => prev.map(i => i.name === evalName
            ? { status: "error" as const, name: evalName, error: e instanceof Error ? e.message : "Failed" }
            : i
          ));
        }
      }));
      if (mountedRef.current) setAllCached(false);
    } finally {
      if (mountedRef.current) setGlobalRunning(false);
    }
  }, [projectName, sessionId, agentId, subagentType, subagentDescription, items]);

  // Per-item Re-run handler
  const rerunSingleEval = useCallback(async (evalName: string) => {
    setAllCached(false);
    setItems(prev => prev.map(i => i.name === evalName ? { status: "loading", name: evalName } : i));
    const subagent = agentId ? { agentId, subagentType, subagentDescription } : undefined;
    try {
      const result = await queueAndProcessEval(projectName, sessionId, evalName, true, subagent);
      if (!mountedRef.current) return;
      if (!result.ok && result.error === "__queued__") return;
      if (result.ok) {
        setItems(prev => prev.map(i => i.name === evalName
          ? { status: "done", name: evalName, result: result.result, cached: false }
          : i
        ));
      } else {
        setItems(prev => prev.map(i => i.name === evalName
          ? { status: "error", name: evalName, error: result.error }
          : i
        ));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setItems(prev => prev.map(i =>
        i.name === evalName
          ? { status: "error", name: evalName, error: err instanceof Error ? err.message : "Re-run failed" }
          : i
      ));
    }
  }, [projectName, sessionId, agentId, subagentType, subagentDescription]);

  // Derived header values
  const doneItems = items.filter((i): i is Extract<EvalItemState, { status: "done" }> => i.status === "done");
  const loadingCount = items.filter(i => i.status === "loading").length;
  const visibleResults = doneItems.map(i => i.result).filter(r => !r.skipped);
  const passCount = visibleResults.filter(r => !r.error && r.pass).length;
  const failCount = visibleResults.filter(r => !r.error && !r.pass).length;
  const errorCount = doneItems.filter(i => !!i.result.error).length + items.filter(i => i.status === "error").length;
  const isLoading = probing || loadingCount > 0 || globalRunning;

  // No evals registered — render nothing
  if (noEvals) return null;

  const panelPadding = compact ? "p-2.5" : "p-4";
  const fontSize = compact ? "text-xs" : "text-sm";

  // Probing state (brief, before names arrive)
  if (probing) {
    return (
      <div className={`bg-card border border-border rounded-lg ${panelPadding}`}>
        <div className={`flex items-center gap-2 ${fontSize} text-muted-foreground`}>
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading evals...
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
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Eval Results</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs">
            {passCount > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="font-medium">{passCount}</span>
                <span className="text-muted-foreground">passed</span>
              </div>
            )}
            {failCount > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="font-medium">{failCount}</span>
                <span className="text-muted-foreground">failed</span>
              </div>
            )}
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                <span className="font-medium">{errorCount}</span>
                <span className="text-muted-foreground">errored</span>
              </div>
            )}
            {loadingCount > 0 && (
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                <span className="text-muted-foreground">{loadingCount} running...</span>
              </div>
            )}
            {allCached && !isLoading && (
              <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                cached
              </span>
            )}
          </div>
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

      {/* Results list (collapsible) */}
      {!collapsed && (
        <div className="divide-y divide-border/50">
          {visibleItems.map(item => {
            if (item.status === "loading") return <EvalLoadingRow key={item.name} name={item.name} />;
            if (item.status === "error") return <EvalErrorRow key={item.name} name={item.name} error={item.error} />;
            return <EvalResultRow key={item.name} result={item.result} cached={item.cached} onRerun={rerunSingleEval} globalLoading={globalRunning} />;
          })}
        </div>
      )}
    </div>
  );
}
