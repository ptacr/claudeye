/**
 * Type definitions for the enrichment system.
 * Enrichers return key-value metadata for sessions (as opposed to evals which grade them).
 * Reuses EvalContext from types.ts — no duplication.
 */
import type { EvalContext, ConditionFunction, EvalScope } from "./types";

/** Allowed value types for enrichment results. */
export type EnrichmentValue = string | number | boolean;

/** The key-value map returned by an enricher function. */
export type EnrichmentResult = Record<string, EnrichmentValue>;

/** An enricher function signature. */
export type EnrichFunction = (
  context: EvalContext,
) => EnrichmentResult | Promise<EnrichmentResult>;

/** An enricher function stored in the registry. */
export interface RegisteredEnricher {
  name: string;
  fn: EnrichFunction;
  condition?: ConditionFunction;
  scope: EvalScope;
  subagentType?: string;
}

/** Result of running a single enricher. */
export interface EnrichRunResult {
  name: string;
  data: EnrichmentResult;
  durationMs: number;
  error?: string;
  skipped?: boolean;
}

/** Summary of running all registered enrichers. */
export interface EnrichRunSummary {
  results: EnrichRunResult[];
  totalDurationMs: number;
  errorCount: number;
  skippedCount: number;
}
