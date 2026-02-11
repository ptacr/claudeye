/**
 * Module-level singleton condition registry backed by globalThis.
 * Stores an optional global condition function that gates all evals and enrichments.
 */
import type { ConditionFunction } from "./types";

const REGISTRY_KEY = "__CLAUDEYE_CONDITION_REGISTRY__";

interface GlobalWithCondition {
  [REGISTRY_KEY]?: ConditionFunction | null;
}

export function setGlobalCondition(fn: ConditionFunction): void {
  const g = globalThis as GlobalWithCondition;
  g[REGISTRY_KEY] = fn;
}

export function getGlobalCondition(): ConditionFunction | null {
  const g = globalThis as GlobalWithCondition;
  return g[REGISTRY_KEY] ?? null;
}

export function clearGlobalCondition(): void {
  const g = globalThis as GlobalWithCondition;
  g[REGISTRY_KEY] = null;
}
