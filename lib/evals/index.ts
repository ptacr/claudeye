/**
 * Barrel export for the claudeye eval system.
 * This is the public API surface published via `dist/`.
 */
export { createApp } from "./app";
export type { ClaudeyeApp, ClaudeyeAppOptions, EvalOptions, EnrichOptions } from "./app";
export type {
  EvalScope,
  EvalContext,
  EvalResult,
  EvalFunction,
  EvalLogEntry,
  EvalLogStats,
  EvalContentBlock,
  RegisteredEval,
  EvalRunResult,
  EvalRunSummary,
  ConditionFunction,
} from "./types";
export type {
  EnrichmentValue,
  EnrichmentResult,
  EnrichFunction,
  RegisteredEnricher,
  EnrichRunResult,
  EnrichRunSummary,
} from "./enrich-types";
