/**
 * Standalone type definitions for the eval system.
 * These use structural types (not imports from log-entries.ts) so the
 * published dist/ build has no Next.js or Node.js fs dependencies.
 */

/** Minimal content block (structural match for ContentBlock from log-entries). */
export interface EvalContentBlock {
  type: string;
  [key: string]: unknown;
}

/** Minimal log entry (structural match for LogEntry from log-entries). */
export interface EvalLogEntry {
  type: string;
  _source?: string;
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  timestampMs: number;
  timestampFormatted: string;
  message?: {
    role: string;
    content: string | EvalContentBlock[];
    model?: string;
  };
  raw?: Record<string, unknown>;
  label?: string;
}

/** Minimal log stats (structural match for LogStats from log-stats). */
export interface EvalLogStats {
  turnCount: number;
  userCount: number;
  assistantCount: number;
  toolCallCount: number;
  subagentCount: number;
  duration: string;
  models: string[];
}

/** Scope for eval/enrichment registration. */
export type EvalScope = 'session' | 'subagent' | 'both';

/** Context passed to each eval function. */
export interface EvalContext {
  entries: Record<string, unknown>[];
  stats: EvalLogStats;
  projectName: string;
  sessionId: string;
  scope: 'session' | 'subagent';
  subagentId?: string;
  subagentType?: string;
  subagentDescription?: string;
  parentSessionId?: string;
}

/** Result returned by an eval function. */
export interface EvalResult {
  pass: boolean;
  score?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

/** An eval function signature. */
export type EvalFunction = (context: EvalContext) => EvalResult | Promise<EvalResult>;

/** A condition function that gates eval/enrichment execution. */
export type ConditionFunction = (context: EvalContext) => boolean | Promise<boolean>;

/** An eval function stored in the registry. */
export interface RegisteredEval {
  name: string;
  fn: EvalFunction;
  condition?: ConditionFunction;
  scope: EvalScope;
  subagentType?: string;
}

/** Result of running a single eval. */
export interface EvalRunResult {
  name: string;
  pass: boolean;
  score: number;
  message?: string;
  metadata?: Record<string, unknown>;
  durationMs: number;
  error?: string;
  skipped?: boolean;
}

/** Summary of running all registered evals. */
export interface EvalRunSummary {
  results: EvalRunResult[];
  totalDurationMs: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  skippedCount: number;
}
