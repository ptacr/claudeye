"use server";

import { readFile } from "fs/promises";
import { join, relative } from "path";
import { getClaudeProjectsPath } from "@/lib/paths";
import { parseLogContent, parseRawLines } from "@/lib/log-entries";
import type { LogEntry } from "@/lib/log-entries";

export type SubagentLogResult =
  | { ok: true; entries: LogEntry[]; rawLines: Record<string, unknown>[] }
  | { ok: false; error: string };

/**
 * Loads and parses a subagent's JSONL log file on demand.
 * Returns a result object instead of throwing so the error message
 * reaches the client (Next.js sanitizes thrown server action errors).
 */
export async function loadSubagentLog(
  projectName: string,
  sessionId: string,
  agentId: string
): Promise<SubagentLogResult> {
  // Validate agentId to prevent path traversal
  if (!/^[a-f0-9]+$/.test(agentId)) {
    return { ok: false, error: `Invalid agent ID: ${agentId}` };
  }

  // Validate sessionId — strict UUID format
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sessionId)) {
    return { ok: false, error: `Invalid session ID: ${sessionId}` };
  }

  // Validate projectName — reject empty or containing .. path segments
  if (!projectName || /(^|[\\/])\.\.($|[\\/])/.test(projectName)) {
    return { ok: false, error: `Invalid project name: ${projectName}` };
  }

  const projectsPath = getClaudeProjectsPath();

  // Candidate paths in priority order
  const fileName = `agent-${agentId}.jsonl`;
  const candidatePaths = [
    join(projectsPath, projectName, fileName),                        // {project}/agent-{id}.jsonl
    join(projectsPath, projectName, sessionId, fileName),             // {project}/{sessionId}/agent-{id}.jsonl
    join(projectsPath, projectName, sessionId, "subagents", fileName) // {project}/{sessionId}/subagents/agent-{id}.jsonl
  ];

  // Verify all candidate paths stay within projectsPath
  for (const candidatePath of candidatePaths) {
    const rel = relative(projectsPath, candidatePath);
    if (rel.startsWith("..") || relative(projectsPath, candidatePath).startsWith("..")) {
      return { ok: false, error: "Path traversal detected" };
    }
  }

  let fileContent: string | undefined;
  for (const path of candidatePaths) {
    try {
      fileContent = await readFile(path, "utf-8");
      break;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        return { ok: false, error: `Failed to read subagent log: ${code ?? "unknown error"}` };
      }
    }
  }

  if (!fileContent) {
    return { ok: false, error: `Subagent log not found: ${fileName}\nTried:\n${candidatePaths.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}` };
  }

  try {
    const entries = parseLogContent(fileContent);
    const rawLines = parseRawLines(fileContent);
    return { ok: true, entries, rawLines };
  } catch {
    return { ok: false, error: `Failed to parse subagent log: agent-${agentId}.jsonl` };
  }
}
