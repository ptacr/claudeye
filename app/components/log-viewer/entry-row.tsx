import React, { useState, useCallback } from "react";
import { Workflow, ChevronRight } from "lucide-react";
import type { LogEntry, ToolUseBlock } from "@/lib/log-entries";
import { cn } from "@/lib/utils";
import { loadSubagentLog } from "@/app/actions/load-subagent-log";
import { ENTRY_BORDER_COLORS } from "./constants";
import { TypeBadge } from "./type-badge";
import { ToolInputOutput } from "./tool-input-output";
import { StatsBar } from "./stats-bar";
import EvalResultsPanel from "@/app/components/eval-results-panel";
import EnrichmentResultsPanel from "@/app/components/enrichment-results-panel";
import { QueueDivider } from "./queue-divider";
import { UserContent, AssistantContent, GenericContent } from "./content-block-view";
import { formatLocalTimestamp, getEntryTextContent } from "@/lib/log-format";
import { CopyButton } from "@/app/components/copy-button";

// ── Subagent Tool Card ──

interface SubagentToolCardProps {
  block: ToolUseBlock;
  projectName: string;
  sessionId: string;
}

export function SubagentToolCard({ block, projectName, sessionId }: SubagentToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // If we already loaded entries, just expand (cached)
    if (entries) return;

    if (!block.subagentId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await loadSubagentLog(projectName, sessionId, block.subagentId);
      if (result.ok) {
        setEntries(result.entries);
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subagent log");
    } finally {
      setLoading(false);
    }
  }, [expanded, entries, block.subagentId, projectName, sessionId]);

  return (
    <div className="border border-border/50 rounded-lg p-3 bg-muted/10">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Workflow className="w-4 h-4 text-[color:var(--chart-5)]" />
        <span className="font-mono text-sm text-[color:var(--chart-5)]">Subagent</span>
        {block.subagentType && (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono rounded border bg-[color:var(--chart-5)]/20 text-[color:var(--chart-5)] border-[color:var(--chart-5)]/30">
            {block.subagentType}
          </span>
        )}
        {block.result && (
          <span className="text-xs text-muted-foreground ml-auto">
            {block.result.durationFormatted}
          </span>
        )}
      </div>

      {/* Description */}
      {block.subagentDescription && (
        <p className="text-sm text-muted-foreground mb-2">
          {block.subagentDescription}
        </p>
      )}

      {/* Expand button */}
      {block.subagentId && (
        <button
          onClick={handleToggle}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors mb-2"
        >
          <ChevronRight
            className={cn("w-3 h-3 transition-transform", expanded && "rotate-90")}
          />
          <span>agent-{block.subagentId}</span>
          <span className="text-muted-foreground">
            {expanded ? "Collapse" : "View subagent log"}
          </span>
        </button>
      )}

      {/* Nested subagent log */}
      {expanded && (
        <div className="ml-4 pl-3 border-l-2 border-primary/30 mt-2 space-y-2">
          {loading && (
            <div className="text-xs text-muted-foreground py-2">Loading subagent log...</div>
          )}
          {error && (
            <div className="text-xs text-destructive py-2">{error}</div>
          )}
          {entries && entries.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">No entries found in subagent log.</div>
          )}
          {entries && entries.length > 0 && (
            <>
              <StatsBar entries={entries} compact />
              <EvalResultsPanel
                projectName={projectName}
                sessionId={sessionId}
                agentId={block.subagentId}
                subagentType={block.subagentType}
                subagentDescription={block.subagentDescription}
                compact
              />
              <EnrichmentResultsPanel
                projectName={projectName}
                sessionId={sessionId}
                agentId={block.subagentId}
                subagentType={block.subagentType}
                subagentDescription={block.subagentDescription}
                compact
              />
            </>
          )}
          {entries && entries.map((entry) =>
            entry.type === "queue-operation" ? (
              <QueueDivider
                key={entry.uuid || entry.timestamp}
                entry={entry}
              />
            ) : (
              <EntryRow
                key={entry.uuid || entry.timestamp}
                entry={entry}
                projectName={projectName}
                sessionId={sessionId}
              />
            )
          )}
        </div>
      )}

      {/* Raw input/output */}
      <ToolInputOutput block={block} />
    </div>
  );
}

// ── Entry Row ──

interface EntryRowProps {
  entry: LogEntry;
  projectName: string;
  sessionId: string;
}

function EntryContent({ entry, projectName, sessionId }: EntryRowProps): React.ReactNode {
  switch (entry.type) {
    case "user":
      return <UserContent entry={entry} />;
    case "assistant":
      return <AssistantContent entry={entry} projectName={projectName} sessionId={sessionId} />;
    case "file-history-snapshot":
    case "progress":
    case "system":
      return <GenericContent entry={entry} />;
  }
}

export const EntryRow = React.memo(function EntryRow({ entry, projectName, sessionId }: EntryRowProps) {
  return (
    <div
      className={`border-l-4 ${ENTRY_BORDER_COLORS[entry.type]} bg-card/50 rounded-r-lg mb-2 hover:bg-muted/30 transition-colors`}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
        <TypeBadge type={entry.type} />
        <div className="flex items-center gap-1 ml-auto">
          <CopyButton text={getEntryTextContent(entry)} />
          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
            {formatLocalTimestamp(entry.timestampMs)}
          </span>
        </div>
      </div>
      <div className="px-4 py-3">
        <EntryContent entry={entry} projectName={projectName} sessionId={sessionId} />
      </div>
    </div>
  );
});
