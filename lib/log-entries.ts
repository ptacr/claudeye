import { readFile } from "fs/promises";
import { join } from "path";
import { getClaudeProjectsPath } from "./paths";
import { extractSubagentIds } from "./extract-subagent-ids";
import { resolveSubagentPath } from "./resolve-subagent-path";
import { runtimeCache } from "./runtime-cache";
import { formatDate } from "./utils";
import { formatDuration } from "./format-duration";

// ── Source Tagging ──

export type LogSource = "session" | `agent-${string}`;

// ── Content Block Types (for assistant messages) ──

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolResultInfo {
  timestamp: string;
  timestampFormatted: string;
  content?: string;
  durationMs: number;
  durationFormatted: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: ToolResultInfo;
  subagentType?: string;
  subagentDescription?: string;
  subagentId?: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock;

// ── Log Entry Types ──

export interface UserEntry {
  type: "user";
  _source: LogSource;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  timestampMs: number;
  timestampFormatted: string;
  message: {
    role: "user";
    content: string;
  };
}

export interface AssistantEntry {
  type: "assistant";
  _source: LogSource;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  timestampMs: number;
  timestampFormatted: string;
  message: {
    role: "assistant";
    content: ContentBlock[];
    model?: string;
  };
}

export interface GenericEntry {
  type: "file-history-snapshot" | "progress" | "system";
  _source: LogSource;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  timestampMs: number;
  timestampFormatted: string;
  raw: Record<string, unknown>;
}

export interface QueueOperationEntry {
  type: "queue-operation";
  _source: LogSource;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  timestampMs: number;
  timestampFormatted: string;
  label: "Session Started" | "Session Resumed";
}

export type LogEntry =
  | UserEntry
  | AssistantEntry
  | GenericEntry
  | QueueOperationEntry;

export type LogEntryType = LogEntry["type"];

// ── Helpers ──

function formatTimestamp(date: Date): string {
  const base = formatDate(date);
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${base}.${ms}`;
}

/** Shared base fields present on every log entry. */
function baseEntry(raw: Record<string, unknown>, timestamp: string, date: Date, source: LogSource) {
  return {
    _source: source,
    uuid: (raw.uuid as string) || "",
    parentUuid: (raw.parentUuid as string | null) ?? null,
    timestamp,
    timestampMs: date.getTime(),
    timestampFormatted: formatTimestamp(date),
  };
}

function extractToolResultContent(
  block: Record<string, unknown>
): string | undefined {
  const resultContent = block.content;
  if (typeof resultContent === "string") return resultContent;
  if (Array.isArray(resultContent)) {
    const textParts = (resultContent as Array<Record<string, unknown>>)
      .filter((r) => r.type === "text")
      .map((r) => r.text as string);
    if (textParts.length > 0) return textParts.join("\n");
  }
  return undefined;
}

export function parseRawLines(fileContent: string, source?: LogSource): Record<string, unknown>[] {
  return fileContent
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (source !== undefined) parsed._source = source;
        return [parsed];
      }
      catch { return []; }
    });
}

export interface SessionLogData {
  entries: LogEntry[];
  rawLines: Record<string, unknown>[];
  subagentIds: string[];
}

// ── Parser ──

/**
 * Parses JSONL log content into structured log entries.
 * Returns entries sorted by timestamp ascending (earliest first).
 * Tool use blocks are enriched with their corresponding results.
 */
export function parseLogContent(fileContent: string, source: LogSource = "session"): LogEntry[] {
  const lines = fileContent.split("\n").filter((line) => line.trim() !== "");

  // Single pass: parse entries and build tool result map simultaneously
  const toolResultMap = new Map<
    string,
    { timestamp: string; timestampMs: number; content?: string; agentId?: string }
  >();
  const entries: LogEntry[] = [];
  let seenQueue = false;

  for (const line of lines) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = raw.type as string | undefined;
    const timestamp = raw.timestamp as string;
    if (!timestamp) continue;

    const date = new Date(timestamp);
    const timestampMs = date.getTime();

    // Tool results arrive as "user" entries whose content array contains
    // `tool_result` blocks.  We capture them in a lookup map keyed by
    // `tool_use_id` so the enrichment pass (below) can attach each result
    // back to its corresponding `tool_use` block on the assistant entry.
    // These user entries are intentionally *skipped* from the output list
    // because they carry no standalone user message — they're purely
    // plumbing between the assistant's tool call and the tool's response.
    if (type === "user") {
      const message = raw.message as Record<string, unknown> | undefined;
      if (Array.isArray(message?.content)) {
        const blocks = message.content as Array<Record<string, unknown>>;
        const hasToolResult = blocks.some((b) => b.type === "tool_result");
        if (hasToolResult) {
          const toolUseResult = raw.toolUseResult as Record<string, unknown> | undefined;
          const agentId = (typeof toolUseResult?.agentId === "string") ? toolUseResult.agentId : undefined;
          for (const block of blocks) {
            if (block.type !== "tool_result") continue;
            const toolUseId = block.tool_use_id as string | undefined;
            if (!toolUseId) continue;
            toolResultMap.set(toolUseId, {
              timestamp,
              timestampMs,
              content: extractToolResultContent(block),
              agentId,
            });
          }
          continue;
        }
      }

      // Regular user message
      const content =
        typeof message?.content === "string" ? message.content : "";
      entries.push({ type: "user", ...baseEntry(raw, timestamp, date, source), message: { role: "user", content } });
      continue;
    }

    if (type === "assistant") {
      const message = raw.message as Record<string, unknown> | undefined;
      let content: ContentBlock[] = [];

      if (Array.isArray(message?.content)) {
        content = (message.content as Array<Record<string, unknown>>)
          .filter((block) =>
            ["text", "tool_use", "thinking"].includes(block.type as string)
          )
          .map((block) => {
            if (block.type === "text") {
              return { type: "text" as const, text: block.text as string };
            }
            if (block.type === "tool_use") {
              const input = block.input as Record<string, unknown> | undefined;
              return {
                type: "tool_use" as const,
                id: block.id as string,
                name: block.name as string,
                input: (block.input as Record<string, unknown>) ?? {},
                ...(block.name === "Task" && input ? {
                  subagentType: input.subagent_type as string | undefined,
                  subagentDescription: input.description as string | undefined,
                } : {}),
              };
            }
            return {
              type: "thinking" as const,
              thinking: block.thinking as string,
              signature: block.signature as string | undefined,
            };
          });
      }

      if (content.length === 0) continue;

      entries.push({
        type: "assistant",
        ...baseEntry(raw, timestamp, date, source),
        message: { role: "assistant", content, model: message?.model as string | undefined },
      });
      continue;
    }

    if (type === "file-history-snapshot" || type === "progress" || type === "system") {
      entries.push({ type, ...baseEntry(raw, timestamp, date, source), raw: { ...raw } });
      continue;
    }

    if (type === "queue-operation") {
      const label = seenQueue ? "Session Resumed" : "Session Started";
      seenQueue = true;
      entries.push({ type: "queue-operation", ...baseEntry(raw, timestamp, date, source), label });
      continue;
    }
  }

  // Enrichment pass: walk every assistant entry's tool_use blocks and
  // attach the matching tool result (timestamp, content, duration).
  // This lets the UI render tool calls and their results together in a
  // single card rather than as separate entries.
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    for (const block of entry.message.content) {
      if (block.type !== "tool_use") continue;
      const resultInfo = toolResultMap.get(block.id);
      if (!resultInfo) continue;

      const returnDate = new Date(resultInfo.timestamp);
      const durationMs = resultInfo.timestampMs - entry.timestampMs;
      block.result = {
        timestamp: resultInfo.timestamp,
        timestampFormatted: formatTimestamp(returnDate),
        content: resultInfo.content,
        durationMs,
        durationFormatted: formatDuration(durationMs),
      };
      if (resultInfo.agentId) {
        block.subagentId = resultInfo.agentId;
      }
    }
  }

  // Sort by timestamp ascending (numeric comparison, no object creation)
  entries.sort((a, b) => a.timestampMs - b.timestampMs);

  return entries;
}

/**
 * Reads and parses a session JSONL log file.
 * Eagerly loads all subagent JSONL files and merges them into a single
 * entries/rawLines array with `_source` markers.
 */
export async function parseSessionLog(
  projectName: string,
  sessionId: string,
): Promise<SessionLogData> {
  const projectsPath = getClaudeProjectsPath();
  const filePath = join(projectsPath, projectName, `${sessionId}.jsonl`);
  const fileContent = await readFile(filePath, "utf-8");

  const sessionEntries = parseLogContent(fileContent, "session");
  const sessionRawLines = parseRawLines(fileContent, "session");

  const subagentIds = extractSubagentIds(fileContent);
  if (subagentIds.length === 0) {
    return { entries: sessionEntries, rawLines: sessionRawLines, subagentIds: [] };
  }

  // Load all subagent files in parallel
  const results = await Promise.allSettled(
    subagentIds.map(async (agentId) => {
      const agentSource: LogSource = `agent-${agentId}`;
      const agentPath = await resolveSubagentPath(projectsPath, projectName, sessionId, agentId);
      if (!agentPath) return null;
      const agentContent = await readFile(agentPath, "utf-8");
      return {
        entries: parseLogContent(agentContent, agentSource),
        rawLines: parseRawLines(agentContent, agentSource),
      };
    })
  );

  // Combine all entries and rawLines
  const allEntries = [...sessionEntries];
  const allRawLines = [...sessionRawLines];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      allEntries.push(...result.value.entries);
      allRawLines.push(...result.value.rawLines);
    }
  }

  // Sort combined entries by timestamp
  allEntries.sort((a, b) => a.timestampMs - b.timestampMs);

  return { entries: allEntries, rawLines: allRawLines, subagentIds };
}

export const getCachedSessionLog = runtimeCache(
  (projectName: string, sessionId: string) => parseSessionLog(projectName, sessionId),
  60
);
