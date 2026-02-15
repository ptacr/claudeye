/**
 * Raw Log Viewer — renders a parsed session log as a virtualized scrollable
 * list of timestamped entries (user messages, assistant responses, tool calls,
 * system events) with a summary stats bar at the top.
 */
"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { LogEntry } from "@/lib/log-entries";
import { StatsBar } from "@/app/components/log-viewer/stats-bar";
import { QueueDivider } from "@/app/components/log-viewer/queue-divider";
import { EntryRow } from "@/app/components/log-viewer/entry-row";
import EvalResultsPanel from "@/app/components/eval-results-panel";
import EnrichmentResultsPanel from "@/app/components/enrichment-results-panel";


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

  return (
    <div className="space-y-4">
      <StatsBar entries={sessionEntries} />

      <EvalResultsPanel projectName={projectName} sessionId={sessionId} />

      <EnrichmentResultsPanel projectName={projectName} sessionId={sessionId} />

      <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
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
    </div>
  );
}
