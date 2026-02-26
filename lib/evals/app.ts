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
import { registerAction } from "./action-registry";
import { registerAlert } from "./alert-registry";
import { registerFilter, registerView, registerAggregate } from "./dashboard-registry";
import { setGlobalCondition } from "./condition-registry";
import { registerAuthUsers } from "./auth-registry";
import type { AuthUser } from "./auth-registry";
import type { ConditionFunction, EvalFunction, EvalScope } from "./types";
import type { EnrichFunction } from "./enrich-types";
import type { ActionFunction } from "./action-types";
import type { AlertFunction } from "./alert-types";
import type { FilterFunction, FilterOptions, ViewOptions, AggregateDefinition, AggregateOptions } from "./dashboard-types";

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

export interface ActionOptions {
  condition?: ConditionFunction;
  scope?: EvalScope;
  subagentType?: string;
  cache?: boolean;
}

export interface DashboardViewBuilder {
  /** Register a filter on this view. Returns the view builder for chaining. */
  filter(name: string, fn: FilterFunction, options?: FilterOptions): DashboardViewBuilder;
  /** Register an aggregate on this view. Returns the view builder for chaining. */
  aggregate(name: string, definition: AggregateDefinition, options?: AggregateOptions): DashboardViewBuilder;
}

export interface DashboardBuilder {
  /** Register a dashboard filter on the default view. Returns the app for chaining. */
  filter(name: string, fn: FilterFunction, options?: FilterOptions): ClaudeyeApp;
  /** Register an aggregate on the default view. Returns the app for chaining. */
  aggregate(name: string, definition: AggregateDefinition, options?: AggregateOptions): ClaudeyeApp;
  /** Create or get a named dashboard view. Returns a view builder. */
  view(name: string, options?: ViewOptions): DashboardViewBuilder;
}

export interface ClaudeyeApp {
  /** Register a global condition that gates all evals and enrichments. Chainable. */
  condition(fn: ConditionFunction): ClaudeyeApp;
  /** Register an eval function. Chainable. */
  eval(name: string, fn: EvalFunction, options?: EvalOptions): ClaudeyeApp;
  /** Register an enricher function. Chainable. */
  enrich(name: string, fn: EnrichFunction, options?: EnrichOptions): ClaudeyeApp;
  /** Register a user-defined action. Chainable. */
  action(name: string, fn: ActionFunction, options?: ActionOptions): ClaudeyeApp;
  /** Register an alert callback that fires after all evals+enrichments complete. Chainable. */
  alert(name: string, fn: AlertFunction): ClaudeyeApp;
  /** Configure username/password authentication. Chainable. */
  auth(options: { users: AuthUser[] }): ClaudeyeApp;
  /** Dashboard filter registration namespace. */
  dashboard: DashboardBuilder;
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

    action(name: string, fn: ActionFunction, options?: ActionOptions): ClaudeyeApp {
      registerAction(name, fn, options?.condition, options?.scope, options?.subagentType, options?.cache);
      return app;
    },

    alert(name: string, fn: AlertFunction): ClaudeyeApp {
      registerAlert(name, fn);
      return app;
    },

    auth(options: { users: AuthUser[] }): ClaudeyeApp {
      registerAuthUsers(options.users);
      return app;
    },

    dashboard: {
      filter(name: string, fn: FilterFunction, options?: FilterOptions): ClaudeyeApp {
        registerFilter(name, fn, options?.label, options?.condition, "default");
        return app;
      },
      aggregate(name: string, definition: AggregateDefinition, options?: AggregateOptions): ClaudeyeApp {
        registerAggregate(name, definition, options?.label, options?.condition, "default");
        return app;
      },
      view(name: string, options?: ViewOptions): DashboardViewBuilder {
        registerView(name, options?.label ?? name);
        const viewBuilder: DashboardViewBuilder = {
          filter(filterName: string, fn: FilterFunction, filterOptions?: FilterOptions): DashboardViewBuilder {
            registerFilter(filterName, fn, filterOptions?.label, filterOptions?.condition, name);
            return viewBuilder;
          },
          aggregate(aggName: string, definition: AggregateDefinition, aggOptions?: AggregateOptions): DashboardViewBuilder {
            registerAggregate(aggName, definition, aggOptions?.label, aggOptions?.condition, name);
            return viewBuilder;
          },
        };
        return viewBuilder;
      },
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
