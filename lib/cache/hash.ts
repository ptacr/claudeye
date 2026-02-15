import { createHash } from "crypto";
import { stat, readFile } from "fs/promises";
import { join, resolve } from "path";
import { getClaudeProjectsPath } from "../paths";

/**
 * Returns a short hash (first 8 hex chars of SHA-256) of the resolved
 * absolute projects-path. Used to namespace cache keys so that different
 * `--projects-path` values never collide.
 *
 * Memoized — the hash is computed once per process.
 */
let _cachedPathHash: string | null = null;
export function hashProjectsPath(): string {
  if (_cachedPathHash) return _cachedPathHash;
  const projectsPath = resolve(getClaudeProjectsPath());
  _cachedPathHash = createHash("sha256").update(projectsPath).digest("hex").slice(0, 8);
  return _cachedPathHash;
}

/** @internal Reset memoized hash — only for tests. */
export function _resetPathHashCache(): void {
  _cachedPathHash = null;
}

/**
 * Hashes a session file using its mtime + size for speed.
 * JSONL session files are append-only, so mtime+size reliably
 * detects changes without reading the full file.
 */
export async function hashSessionFile(
  projectName: string,
  sessionId: string,
): Promise<string> {
  const projectsPath = getClaudeProjectsPath();
  const filePath = join(projectsPath, projectName, `${sessionId}.jsonl`);
  const s = await stat(filePath);
  const content = `${s.mtimeMs}:${s.size}`;
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Hashes a subagent log file using its mtime + size for speed.
 * Tries multiple candidate paths (same logic as load-subagent-log)
 * and hashes the first one found. Returns empty string if none found.
 */
export async function hashSubagentFile(
  projectName: string,
  sessionId: string,
  agentId: string,
): Promise<string> {
  const projectsPath = getClaudeProjectsPath();
  const fileName = `agent-${agentId}.jsonl`;
  const candidatePaths = [
    join(projectsPath, projectName, fileName),
    join(projectsPath, projectName, sessionId, fileName),
    join(projectsPath, projectName, sessionId, "subagents", fileName),
  ];

  for (const filePath of candidatePaths) {
    try {
      const s = await stat(filePath);
      const content = `${s.mtimeMs}:${s.size}`;
      return createHash("sha256").update(content).digest("hex");
    } catch {
      // Try next candidate
    }
  }

  return "";
}

/**
 * Hashes an individual item's function code using SHA-256 of fn.toString().
 * Detects when a specific eval/enricher function has been modified,
 * without invalidating other items in the same module.
 */
export function hashItemCode(fn: Function): string {
  return createHash("sha256").update(fn.toString()).digest("hex");
}

/**
 * Hashes the evals module file content. These files are small,
 * so a full content hash is fine.
 * Returns empty string if no evals module is configured.
 */
export async function hashEvalsModule(): Promise<string> {
  const evalsModule = process.env.CLAUDEYE_EVALS_MODULE;
  if (!evalsModule) return "";
  try {
    const content = await readFile(evalsModule, "utf-8");
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "";
  }
}
