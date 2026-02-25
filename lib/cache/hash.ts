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

// ── Short-term TTL cache for hashSessionFile ──

const STAT_CACHE_TTL_MS = 5000;
const _statCache = new Map<string, { hash: string; expiresAt: number }>();

/** @internal Reset stat cache — only for tests. */
export function _resetStatCache(): void {
  _statCache.clear();
}

/**
 * Hashes a session file using its mtime + size for speed.
 * JSONL session files are append-only, so mtime+size reliably
 * detects changes without reading the full file.
 *
 * Results are cached for 5 seconds to avoid redundant stat() calls
 * within a single eval cycle.
 */
export async function hashSessionFile(
  projectName: string,
  sessionId: string,
): Promise<string> {
  const projectsPath = getClaudeProjectsPath();
  const filePath = join(projectsPath, projectName, `${sessionId}.jsonl`);

  const now = Date.now();
  const cached = _statCache.get(filePath);
  if (cached && cached.expiresAt > now) {
    return cached.hash;
  }

  const s = await stat(filePath);
  const content = `${s.mtimeMs}:${s.size}`;
  const hash = createHash("sha256").update(content).digest("hex");

  _statCache.set(filePath, { hash, expiresAt: now + STAT_CACHE_TTL_MS });
  return hash;
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

  const results = await Promise.allSettled(
    candidatePaths.map((filePath) => stat(filePath)),
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      const s = result.value;
      const content = `${s.mtimeMs}:${s.size}`;
      return createHash("sha256").update(content).digest("hex");
    }
  }

  return "";
}

/**
 * Hashes an individual item's function code using SHA-256 of fn.toString().
 * Detects when a specific eval/enricher function has been modified,
 * without invalidating other items in the same module.
 *
 * Memoized per function reference — the code never changes within a process.
 */
const _itemCodeCache = new WeakMap<Function, string>();
export function hashItemCode(fn: Function): string {
  let hash = _itemCodeCache.get(fn);
  if (hash) return hash;
  hash = createHash("sha256").update(fn.toString()).digest("hex");
  _itemCodeCache.set(fn, hash);
  return hash;
}

// ── Memoized hashEvalsModule ──

let _cachedEvalsModuleHash: string | null = null;

/** @internal Reset evals module hash cache — only for tests. */
export function _resetEvalsModuleHashCache(): void {
  _cachedEvalsModuleHash = null;
}

/**
 * Hashes the evals module file content. These files are small,
 * so a full content hash is fine.
 * Returns empty string if no evals module is configured.
 *
 * Memoized — the evals module file doesn't change during a process run.
 */
export async function hashEvalsModule(): Promise<string> {
  if (_cachedEvalsModuleHash !== null) return _cachedEvalsModuleHash;

  const evalsModule = process.env.CLAUDEYE_EVALS_MODULE;
  if (!evalsModule) {
    _cachedEvalsModuleHash = "";
    return "";
  }
  try {
    const content = await readFile(evalsModule, "utf-8");
    _cachedEvalsModuleHash = createHash("sha256").update(content).digest("hex");
    return _cachedEvalsModuleHash;
  } catch {
    _cachedEvalsModuleHash = "";
    return "";
  }
}
