/**
 * Raw Log Viewer — renders a parsed session log as a virtualized scrollable
 * list of timestamped entries (user messages, assistant responses, tool calls,
 * system events) with a summary stats bar at the top.
 */
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Wrench } from "lucide-react";
import type { LogEntry, ToolUseBlock } from "@/lib/log-entries";
import { StatsBar } from "@/app/components/log-viewer/stats-bar";
import { QueueDivider } from "@/app/components/log-viewer/queue-divider";
import { EntryRow } from "@/app/components/log-viewer/entry-row";
import EvalResultsPanel from "@/app/components/eval-results-panel";
import EnrichmentResultsPanel from "@/app/components/enrichment-results-panel";
import { runSessionDashboard, type DashboardResult } from "@/app/actions/run-session-dashboard";

// ── Subagent metadata extraction ──

interface SubagentInfo {
  id: string;
  type: string;
  description: string;
}

function extractSubagents(entries: LogEntry[]): SubagentInfo[] {
  const seen = new Map<string, SubagentInfo>();
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    for (const block of entry.message.content) {
      if (block.type === "tool_use" && block.name === "Task" && block.subagentId) {
        const tb = block as ToolUseBlock;
        if (!seen.has(tb.subagentId!)) {
          seen.set(tb.subagentId!, {
            id: tb.subagentId!,
            type: tb.subagentType || "unknown",
            description: tb.subagentDescription || "",
          });
        }
      }
    }
  }
  return Array.from(seen.values());
}


// ── Tool stats extraction ──

interface ToolStat {
  name: string;
  count: number;
  totalDurationMs: number;
}

function extractToolStats(entries: LogEntry[]): ToolStat[] {
  const map = new Map<string, { count: number; totalDurationMs: number }>();
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    for (const block of entry.message.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "Task" && ((block as ToolUseBlock).subagentType || (block as ToolUseBlock).subagentId)) continue;
      const existing = map.get(block.name) || { count: 0, totalDurationMs: 0 };
      existing.count++;
      if ((block as ToolUseBlock).result?.durationMs) {
        existing.totalDurationMs += (block as ToolUseBlock).result!.durationMs;
      }
      map.set(block.name, existing);
    }
  }
  return Array.from(map.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.count - a.count);
}

function ToolStatsGrid({ tools, compact }: { tools: ToolStat[]; compact?: boolean }) {
  const cols = compact
    ? "grid-cols-2 sm:grid-cols-3 gap-2"
    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";
  return (
    <div className={`bg-card border border-border rounded-lg ${compact ? "p-3" : "p-4"}`}>
      <div className={`grid ${cols}`}>
        {tools.map((tool) => (
          <div key={tool.name} className="flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <div className={`${compact ? "text-xs" : "text-sm"} font-mono font-medium`}>{tool.name}</div>
              <div className="text-xs text-muted-foreground">
                {tool.count} call{tool.count !== 1 ? "s" : ""}
                {tool.totalDurationMs > 0 && ` · ${(tool.totalDurationMs / 1000).toFixed(1)}s`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Virtualized Entry List ──

interface VirtualizedEntryListProps {
  entries: LogEntry[];
  allEntries: LogEntry[];
  projectName: string;
  sessionId: string;
}

// Pixel-height estimates for the virtualizer's initial layout pass.
// Exact accuracy isn't required — the virtualizer measures real DOM heights
// after render and self-corrects, so these just need to be close enough to
// avoid large layout jumps on first paint.
function estimateSize(entry: LogEntry): number {
  switch (entry.type) {
    case "queue-operation":
      return 48;
    case "user":
      return 90;
    case "assistant":
      return 80 + entry.message.content.length * 120;
    default:
      return 100;
  }
}

type QueueOperationEntry = Extract<LogEntry, { type: "queue-operation" }>;

function getSegmentId(entry: QueueOperationEntry): string {
  return `${entry.uuid}-${entry.timestampMs}`;
}

/**
 * Walks the entries array and returns a Map from each queue-operation segment
 * to the count of non-queue-operation entries in its segment (entries after
 * it until the next queue-operation or end of list).
 */
function computeSegments(entries: LogEntry[]): Map<string, number> {
  const segments = new Map<string, number>();
  let currentId: string | null = null;
  let count = 0;

  for (const entry of entries) {
    if (entry.type === "queue-operation") {
      if (currentId !== null) {
        segments.set(currentId, count);
      }
      currentId = getSegmentId(entry);
      count = 0;
    } else if (currentId !== null) {
      count++;
    }
  }
  if (currentId !== null) {
    segments.set(currentId, count);
  }
  return segments;
}

function filterVisibleEntries(entries: LogEntry[], collapsedSessions: Set<string>): LogEntry[] {
  let currentCollapsed = false;
  return entries.filter((entry) => {
    if (entry.type === "queue-operation") {
      currentCollapsed = collapsedSessions.has(getSegmentId(entry as QueueOperationEntry));
      return true; // dividers are always visible
    }
    return !currentCollapsed;
  });
}

function VirtualizedEntryList({ entries, allEntries, projectName, sessionId }: VirtualizedEntryListProps) {
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const [scrollMargin, setScrollMargin] = useState(0);

  const listCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setScrollMargin(node.offsetTop);
  }, []);

  const segments = useMemo(() => computeSegments(entries), [entries]);

  const visibleEntries = useMemo(
    () => filterVisibleEntries(entries, collapsedSessions),
    [entries, collapsedSessions],
  );

  const handleToggleSegment = useCallback((uuid: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: visibleEntries.length,
    estimateSize: (index) => estimateSize(visibleEntries[index]),
    overscan: 5,
    scrollMargin,
  });

  return (
    <div ref={listCallbackRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = visibleEntries[virtualRow.index];
          return (
            <div
              key={entry.type === "queue-operation" ? getSegmentId(entry) : (entry.uuid || entry.timestamp)}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {entry.type === "queue-operation" ? (
                <QueueDivider
                  entry={entry}
                  isCollapsed={collapsedSessions.has(getSegmentId(entry))}
                  entryCount={segments.get(getSegmentId(entry)) ?? 0}
                  onToggle={() => handleToggleSegment(getSegmentId(entry))}
                />
              ) : (
                <EntryRow
                  entry={entry}
                  allEntries={allEntries}
                  projectName={projectName}
                  sessionId={sessionId}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──

interface RawLogViewerProps {
  entries: LogEntry[];
  projectName: string;
  sessionId: string;
}

export default function RawLogViewer({ entries, projectName, sessionId }: RawLogViewerProps) {
  const sessionEntries = useMemo(
    () => entries.filter(e => e._source === "session"),
    [entries]
  );

  const subagents = useMemo(() => extractSubagents(entries), [entries]);

  const subagentEntriesMap = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const sa of subagents) {
      const source = `agent-${sa.id}`;
      map.set(sa.id, entries.filter(e => e._source === source));
    }
    return map;
  }, [entries, subagents]);

  const toolStats = useMemo(() => extractToolStats(sessionEntries), [sessionEntries]);

  const [dashboardResult, setDashboardResult] = useState<DashboardResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    runSessionDashboard(projectName, sessionId, subagents).then((result) => {
      if (!cancelled) setDashboardResult(result);
    });
    return () => { cancelled = true; };
  }, [projectName, sessionId, subagents]);

  const [subagentsCollapsed, setSubagentsCollapsed] = useState(false);
  const [collapsedSubagentIds, setCollapsedSubagentIds] = useState<Set<string>>(new Set());
  const [logsCollapsed, setLogsCollapsed] = useState(false);

  const toggleSubagent = useCallback((id: string) => {
    setCollapsedSubagentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      <StatsBar entries={sessionEntries} />

      <EvalResultsPanel projectName={projectName} sessionId={sessionId} initialResult={dashboardResult?.sessionEvals ?? null} />

      <EnrichmentResultsPanel projectName={projectName} sessionId={sessionId} initialResult={dashboardResult?.sessionEnrichments ?? null} />

      {subagents.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setSubagentsCollapsed(prev => !prev)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${subagentsCollapsed ? "-rotate-90" : ""}`} />
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Subagents</span>
            <span className="text-xs text-muted-foreground">({subagents.length})</span>
          </button>
          {!subagentsCollapsed && subagents.map((sa) => (
            <div
              key={sa.id}
              className="pl-3 border-l-2 border-primary/30 space-y-2"
            >
              <button
                onClick={() => toggleSubagent(sa.id)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${collapsedSubagentIds.has(sa.id) ? "-rotate-90" : ""}`} />
                <span className="text-sm font-bold">{sa.type}</span>
                {sa.description && (
                  <span className="text-xs text-muted-foreground truncate max-w-[400px]">
                    {sa.description}
                  </span>
                )}
              </button>
              {!collapsedSubagentIds.has(sa.id) && (
                <div className="space-y-2">
                  <StatsBar entries={subagentEntriesMap.get(sa.id) || []} compact />
                  <EvalResultsPanel
                    projectName={projectName}
                    sessionId={sessionId}
                    agentId={sa.id}
                    subagentType={sa.type}
                    subagentDescription={sa.description}
                    compact
                    initialResult={dashboardResult?.subagents.find(s => s.agentId === sa.id)?.evals ?? null}
                  />
                  <EnrichmentResultsPanel
                    projectName={projectName}
                    sessionId={sessionId}
                    agentId={sa.id}
                    subagentType={sa.type}
                    subagentDescription={sa.description}
                    compact
                    initialResult={dashboardResult?.subagents.find(s => s.agentId === sa.id)?.enrichments ?? null}
                  />
                  {(() => {
                    const saTools = extractToolStats(subagentEntriesMap.get(sa.id) || []);
                    return saTools.length > 0 ? <ToolStatsGrid tools={saTools} compact /> : null;
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toolStats.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tools</span>
            <span className="text-xs text-muted-foreground">({toolStats.reduce((s, t) => s + t.count, 0)})</span>
          </div>
          <ToolStatsGrid tools={toolStats} />
        </div>
      )}

      <div>
        <button
          onClick={() => setLogsCollapsed(prev => !prev)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${logsCollapsed ? "-rotate-90" : ""}`} />
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Logs</span>
        </button>
        {!logsCollapsed && (
          <div className="mt-2 bg-card border border-border rounded-lg p-4 shadow-sm">
            {sessionEntries.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No entries found.
              </p>
            ) : (
              <VirtualizedEntryList
                entries={sessionEntries}
                allEntries={entries}
                projectName={projectName}
                sessionId={sessionId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
