/**
 * Module-level singleton eval registry backed by globalThis.
 * Using globalThis ensures the registry survives webpack chunk splitting
 * and remains a true singleton across dynamic imports.
 */
import type { ConditionFunction, EvalFunction, EvalScope, RegisteredEval } from "./types";

const REGISTRY_KEY = "__CLAUDEYE_EVAL_REGISTRY__";

interface GlobalWithRegistry {
  [REGISTRY_KEY]?: RegisteredEval[];
}

function getRegistry(): RegisteredEval[] {
  const g = globalThis as GlobalWithRegistry;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = [];
  }
  return g[REGISTRY_KEY];
}

export function registerEval(
  name: string,
  fn: EvalFunction,
  condition?: ConditionFunction,
  scope: EvalScope = 'session',
  subagentType?: string,
): void {
  const registry = getRegistry();
  const entry: RegisteredEval = { name, fn, scope };
  if (condition) entry.condition = condition;
  if (subagentType) entry.subagentType = subagentType;
  // Replace if an eval with the same name already exists
  const idx = registry.findIndex((e) => e.name === name);
  if (idx >= 0) {
    registry[idx] = entry;
  } else {
    registry.push(entry);
  }
}

export function getRegisteredEvals(): RegisteredEval[] {
  return getRegistry();
}

export function getSessionScopedEvals(): RegisteredEval[] {
  return getRegistry().filter((e) => e.scope === 'session' || e.scope === 'both');
}

export function getSubagentScopedEvals(subagentType?: string): RegisteredEval[] {
  return getRegistry().filter((e) => {
    if (e.scope !== 'subagent' && e.scope !== 'both') return false;
    if (e.subagentType && subagentType && e.subagentType !== subagentType) return false;
    return true;
  });
}

export function hasSubagentEvals(): boolean {
  return getRegistry().some((e) => e.scope === 'subagent' || e.scope === 'both');
}

export function hasEvals(): boolean {
  return getRegistry().length > 0;
}

export function clearEvals(): void {
  const g = globalThis as GlobalWithRegistry;
  g[REGISTRY_KEY] = [];
}
