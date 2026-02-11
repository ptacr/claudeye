/**
 * Module-level singleton enricher registry backed by globalThis.
 * Using globalThis ensures the registry survives webpack chunk splitting
 * and remains a true singleton across dynamic imports.
 */
import type { ConditionFunction, EvalScope } from "./types";
import type { EnrichFunction, RegisteredEnricher } from "./enrich-types";

const REGISTRY_KEY = "__CLAUDEYE_ENRICHER_REGISTRY__";

interface GlobalWithRegistry {
  [REGISTRY_KEY]?: RegisteredEnricher[];
}

function getRegistry(): RegisteredEnricher[] {
  const g = globalThis as GlobalWithRegistry;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = [];
  }
  return g[REGISTRY_KEY];
}

export function registerEnricher(
  name: string,
  fn: EnrichFunction,
  condition?: ConditionFunction,
  scope: EvalScope = 'session',
  subagentType?: string,
): void {
  const registry = getRegistry();
  const entry: RegisteredEnricher = { name, fn, scope };
  if (condition) entry.condition = condition;
  if (subagentType) entry.subagentType = subagentType;
  // Replace if an enricher with the same name already exists
  const idx = registry.findIndex((e) => e.name === name);
  if (idx >= 0) {
    registry[idx] = entry;
  } else {
    registry.push(entry);
  }
}

export function getRegisteredEnrichers(): RegisteredEnricher[] {
  return getRegistry();
}

export function getSessionScopedEnrichers(): RegisteredEnricher[] {
  return getRegistry().filter((e) => e.scope === 'session' || e.scope === 'both');
}

export function getSubagentScopedEnrichers(subagentType?: string): RegisteredEnricher[] {
  return getRegistry().filter((e) => {
    if (e.scope !== 'subagent' && e.scope !== 'both') return false;
    if (e.subagentType && subagentType && e.subagentType !== subagentType) return false;
    return true;
  });
}

export function hasSubagentEnrichers(): boolean {
  return getRegistry().some((e) => e.scope === 'subagent' || e.scope === 'both');
}

export function hasEnrichers(): boolean {
  return getRegistry().length > 0;
}

export function clearEnrichers(): void {
  const g = globalThis as GlobalWithRegistry;
  g[REGISTRY_KEY] = [];
}
