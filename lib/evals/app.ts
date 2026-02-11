/**
 * Express-style builder API for registering custom evals.
 *
 * Usage:
 *   import { createApp } from 'claudeye';
 *   const app = createApp();
 *   app.eval('no-errors', ({ entries, stats }) => ({ pass: true, score: 1.0 }));
 *   app.listen(3000);
 */
import { registerEval } from "./registry";
import { registerEnricher } from "./enrich-registry";
import { setGlobalCondition } from "./condition-registry";
import type { ConditionFunction, EvalFunction, EvalScope } from "./types";
import type { EnrichFunction } from "./enrich-types";

const LOADING_KEY = "__CLAUDEYE_LOADING_EVALS__";

interface GlobalWithLoading {
  [LOADING_KEY]?: boolean;
}

export interface ClaudeyeAppOptions {
  /** Port for the dashboard (default: 8020). */
  port?: number;
  /** Host to bind to (default: "localhost"). Use "0.0.0.0" for LAN access. */
  host?: string;
  /** Whether to auto-open the browser (default: true). */
  open?: boolean;
}

export interface EvalOptions {
  condition?: ConditionFunction;
  scope?: EvalScope;
  subagentType?: string;
}

export interface EnrichOptions {
  condition?: ConditionFunction;
  scope?: EvalScope;
  subagentType?: string;
}

export interface ClaudeyeApp {
  /** Register a global condition that gates all evals and enrichments. Chainable. */
  condition(fn: ConditionFunction): ClaudeyeApp;
  /** Register an eval function. Chainable. */
  eval(name: string, fn: EvalFunction, options?: EvalOptions): ClaudeyeApp;
  /** Register an enricher function. Chainable. */
  enrich(name: string, fn: EnrichFunction, options?: EnrichOptions): ClaudeyeApp;
  /** Start the Claudeye dashboard server. No-op when loading evals in the Next.js process. */
  listen(port?: number, options?: ClaudeyeAppOptions): Promise<void>;
}

export function createApp(): ClaudeyeApp {
  const app: ClaudeyeApp = {
    condition(fn: ConditionFunction): ClaudeyeApp {
      setGlobalCondition(fn);
      return app;
    },

    eval(name: string, fn: EvalFunction, options?: EvalOptions): ClaudeyeApp {
      registerEval(name, fn, options?.condition, options?.scope, options?.subagentType);
      return app;
    },

    enrich(name: string, fn: EnrichFunction, options?: EnrichOptions): ClaudeyeApp {
      registerEnricher(name, fn, options?.condition, options?.scope, options?.subagentType);
      return app;
    },

    async listen(port?: number, options?: ClaudeyeAppOptions): Promise<void> {
      // When the Next.js server re-imports the user's file to load evals,
      // listen() becomes a no-op so we don't spawn a second server.
      const g = globalThis as GlobalWithLoading;
      if (g[LOADING_KEY]) {
        return;
      }

      // Dynamically import server-spawn only when actually starting a server.
      // This avoids pulling in Node.js child_process etc. during server-side re-import.
      const { spawnServer } = await import("./server-spawn");
      await spawnServer(port ?? options?.port ?? 8020, {
        open: options?.open ?? true,
        host: options?.host,
      });
    },
  };

  return app;
}
