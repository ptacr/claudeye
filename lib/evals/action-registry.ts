/**
 * Module-level singleton action registry backed by globalThis.
 * Uses the shared createScopedRegistry factory for scope filtering logic.
 */
import { createScopedRegistry } from "./create-registry";
import type { ConditionFunction, EvalScope } from "./types";
import type { ActionFunction, RegisteredAction } from "./action-types";

const registry = createScopedRegistry<RegisteredAction>("__CLAUDEYE_ACTION_REGISTRY__");

export function registerAction(
  name: string,
  fn: ActionFunction,
  condition?: ConditionFunction,
  scope: EvalScope = 'session',
  subagentType?: string,
  cache: boolean = true,
): void {
  const entry: RegisteredAction = { name, fn, scope, cache };
  if (condition) entry.condition = condition;
  if (subagentType) entry.subagentType = subagentType;
  registry.register(entry);
}

export const getRegisteredActions = registry.getAll;
export const getSessionScopedActions = registry.getSessionScoped;
export const getSubagentScopedActions = registry.getSubagentScoped;
export const hasSubagentActions = registry.hasSubagent;
export const hasActions = registry.has;
export const clearActions = registry.clear;
