/**
 * Module-level singleton alert registry backed by globalThis.
 *
 * Alerts are keyed by name — registering a duplicate name replaces
 * the previous callback. Using globalThis ensures the registry
 * survives webpack chunk splitting and remains a true singleton
 * across dynamic imports.
 */
import type { AlertFunction, RegisteredAlert } from "./alert-types";

const REGISTRY_KEY = "__CLAUDEYE_ALERT_REGISTRY__";

interface GlobalWithRegistry {
  [REGISTRY_KEY]?: RegisteredAlert[];
}

function getRegistry(): RegisteredAlert[] {
  const g = globalThis as GlobalWithRegistry;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = [];
  }
  return g[REGISTRY_KEY];
}

export function registerAlert(name: string, fn: AlertFunction): void {
  const registry = getRegistry();
  const idx = registry.findIndex((e) => e.name === name);
  if (idx >= 0) {
    registry[idx] = { name, fn };
  } else {
    registry.push({ name, fn });
  }
}

export function getRegisteredAlerts(): RegisteredAlert[] {
  return getRegistry();
}

export function hasAlerts(): boolean {
  return getRegistry().length > 0;
}

export function clearAlerts(): void {
  const g = globalThis as GlobalWithRegistry;
  g[REGISTRY_KEY] = [];
}
