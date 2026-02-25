/**
 * Barrel export for the claudeye eval system.
 * This is the public API surface published via `dist/`.
 */
export { createApp } from "./app";
export type { ClaudeyeApp, ClaudeyeAppOptions, EvalOptions, EnrichOptions, DashboardBuilder, DashboardViewBuilder } from "./app";
export type { AuthUser } from "./auth-registry";
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
export type { AlertContext, AlertFunction, RegisteredAlert } from "./alert-types";
export type {
  EnrichmentValue,
  EnrichmentResult,
  EnrichFunction,
  RegisteredEnricher,
  EnrichRunResult,
  EnrichRunSummary,
} from "./enrich-types";
export type {
  FilterValue,
  FilterFunction,
  FilterOptions,
  RegisteredFilter,
  FilterComputeResult,
  FilterComputeSummary,
  FilterMeta,
  BooleanFilterMeta,
  NumberFilterMeta,
  StringFilterMeta,
  DashboardSessionRow,
  DashboardPayload,
  ViewOptions,
  RegisteredView,
  DashboardViewInfo,
  AggregateValue,
  AggregateContext,
  AggregateCollectFunction,
  AggregateReduceFunction,
  AggregateDefinition,
  AggregateOptions,
  CollectedSession,
  AggregateTableRow,
  AggregatePayload,
} from "./dashboard-types";
