/**
 * Type definitions for the action system.
 *
 * Actions are a flexible user-defined primitive that can return arbitrary
 * text output, structured data, or perform side-effects. Unlike evals
 * (pass/fail grading) or enrichments (key-value metadata), actions have
 * no fixed output shape — they return whatever the user needs.
 *
 * Actions receive the full session context plus cached eval and enrichment
 * results, and are triggered manually from the dashboard (never automatically).
 *
 * Reuses EvalContext from types.ts — extends it with eval/enrichment results.
 */
import type { EvalContext, ConditionFunction, EvalScope, EvalRunResult } from "./types";
import type { EnrichRunResult } from "./enrich-types";

/** Context passed to each action function. Extends EvalContext with cached results. */
export interface ActionContext extends EvalContext {
  evalResults: Record<string, EvalRunResult>;
  enrichmentResults: Record<string, EnrichRunResult>;
}

/** Result returned by an action function. */
export interface ActionResult {
  output?: string;
  data?: Record<string, unknown>;
  status: 'success' | 'error';
  message?: string;
}

/** An action function signature. */
export type ActionFunction = (
  context: ActionContext,
) => ActionResult | Promise<ActionResult>;

/** An action function stored in the registry. */
export interface RegisteredAction {
  name: string;
  fn: ActionFunction;
  condition?: ConditionFunction;
  scope: EvalScope;
  subagentType?: string;
  cache: boolean;
}

/** Result of running a single action. */
export interface ActionRunResult {
  name: string;
  output?: string;
  data?: Record<string, unknown>;
  status: 'success' | 'error';
  message?: string;
  durationMs: number;
  error?: string;
  skipped?: boolean;
}

/** Summary of running all registered actions. */
export interface ActionRunSummary {
  results: ActionRunResult[];
  totalDurationMs: number;
  errorCount: number;
  skippedCount: number;
}
