# Claudeye API Reference

Full API documentation for Claudeye's custom evals, enrichments, and dashboard filters. For a quick overview, see the [README](../README.md).

---

## `createApp()`

Returns a `ClaudeyeApp` instance. All methods are chainable.

```ts
import { createApp } from 'claudeye';
const app = createApp();
```

---

## `app.condition(fn)`

Set a global condition that gates all evals and enrichments. Calling this multiple times replaces the previous condition.

```ts
app.condition(({ entries, stats, projectName, sessionId }) => boolean | Promise<boolean>);
```

If the global condition returns `false` (or throws), every registered eval and enrichment is skipped.

### Examples

```js
// Only run for sessions with actual content
app.condition(({ entries }) => entries.length > 0);

// Only run for non-test projects
app.condition(({ projectName }) => !projectName.includes('test'));

// Only run for sessions longer than 5 turns
app.condition(({ stats }) => stats.turnCount >= 5);

// Async condition
app.condition(async ({ sessionId }) => {
  // You could check an external service, database, etc.
  return sessionId !== 'skip-this-one';
});
```

### Combining Global and Per-Item Conditions

Global and per-item conditions stack. The global condition runs first; if it passes, per-item conditions are checked individually:

```js
const app = createApp();

// Global: skip everything for empty sessions
app.condition(({ entries }) => entries.length > 0);

// Per-eval: only check turn count for sessions with tool calls
app.eval('efficient-tools',
  ({ stats }) => ({
    pass: stats.toolCallCount <= stats.turnCount * 2,
    score: Math.max(0, 1 - (stats.toolCallCount / (stats.turnCount * 4))),
  }),
  { condition: ({ stats }) => stats.toolCallCount > 0 }
);

// Per-enrichment: only compute model info for sessions that used a model
app.enrich('model-info',
  ({ stats }) => ({
    'Primary Model': stats.models[0] || 'unknown',
    'Model Count': stats.models.length,
  }),
  { condition: ({ stats }) => stats.models.length > 0 }
);
```

> **Note:** Calling `app.condition()` multiple times replaces the previous condition. Only the last one is active. The global condition applies to both evals and enrichments; there's no way to set separate global conditions for each.

---

## `app.eval(name, fn, options?)`

Register an eval function.

- **`name`** - unique string identifier for the eval
- **`fn`** - function receiving an `EvalContext` and returning an `EvalResult`
- **`options.condition`** - optional condition function to gate this eval
- **`options.scope`** - `'session'` (default), `'subagent'`, or `'both'`
- **`options.subagentType`** - only run for subagents of this type (e.g. `'Explore'`)

If a per-eval condition returns `false`, the eval is marked as **skipped** in the results panel. If the condition throws, the eval is marked as **errored** with the message `Condition error: <message>`.

### Examples

```js
// Simple: check if session stayed under a turn budget
app.eval('under-50-turns', ({ stats }) => ({
  pass: stats.turnCount <= 50,
  score: Math.max(0, 1 - stats.turnCount / 100),
  message: `${stats.turnCount} turn(s)`,
}));

// Check tool success rate
app.eval('tool-success-rate', ({ entries }) => {
  const toolResults = entries.filter(e =>
    e.type === 'user' &&
    Array.isArray(e.message?.content) &&
    e.message.content.some(b => b.type === 'tool_result')
  );
  const errors = toolResults.filter(e =>
    e.message?.content?.some(b => b.is_error === true)
  );
  const rate = toolResults.length > 0
    ? 1 - (errors.length / toolResults.length)
    : 1;
  return {
    pass: rate >= 0.9,
    score: rate,
    message: `${errors.length}/${toolResults.length} tool errors`,
  };
});

// Check that the session ended with a text response
app.eval('has-completion', ({ entries }) => {
  const lastAssistant = [...entries].reverse().find(e => e.type === 'assistant');
  const hasText = lastAssistant?.message?.content?.some?.(b => b.type === 'text');
  return {
    pass: !!hasText,
    score: hasText ? 1.0 : 0,
    message: hasText ? 'Session completed with text response' : 'No final text response',
  };
});

// With a per-eval condition: only run for longer sessions
app.eval('under-budget',
  ({ stats }) => ({
    pass: stats.turnCount <= 30,
    score: Math.max(0, 1 - stats.turnCount / 60),
    message: `${stats.turnCount} turns`,
  }),
  { condition: ({ stats }) => stats.turnCount >= 5 }
);

// Subagent-scoped eval
app.eval('subagent-eval', evalFn, {
  scope: 'subagent',
  subagentType: 'Explore',
});
```

---

## `app.enrich(name, fn, options?)`

Register an enricher function.

- **`name`** - unique string identifier for the enricher
- **`fn`** - function receiving an `EvalContext` and returning a `Record<string, string | number | boolean>`
- **`options.condition`** - optional condition function to gate this enricher
- **`options.scope`** - `'session'` (default), `'subagent'`, or `'both'`
- **`options.subagentType`** - only run for subagents of this type (e.g. `'Explore'`)

### Examples

```js
// Session overview
app.enrich('overview', ({ stats }) => ({
  'Turns': stats.turnCount,
  'Tool Calls': stats.toolCallCount,
  'Duration': stats.duration,
  'Models': stats.models.join(', ') || 'none',
}));

// Token and cost breakdown
app.enrich('token-usage', ({ entries }) => {
  const inputTokens = entries.reduce((s, e) => s + (e.usage?.input_tokens || 0), 0);
  const outputTokens = entries.reduce((s, e) => s + (e.usage?.output_tokens || 0), 0);
  return {
    'Input Tokens': inputTokens,
    'Output Tokens': outputTokens,
    'Total Tokens': inputTokens + outputTokens,
    'Est. Cost': `$${((inputTokens * 0.003 + outputTokens * 0.015) / 1000).toFixed(4)}`,
  };
});

// Error analysis (only when errors exist)
app.enrich('error-analysis',
  ({ entries }) => {
    const errors = entries.filter(e => e.is_error === true);
    return {
      'Total Errors': errors.length,
      'Error Rate': `${((errors.length / entries.length) * 100).toFixed(1)}%`,
    };
  },
  { condition: ({ entries }) => entries.some(e => e.is_error === true) }
);

// Subagent info (only when subagents were spawned)
app.enrich('subagent-info',
  ({ entries, stats }) => {
    const subagentEntries = entries.filter(e => e.type === 'assistant' && e.parentUuid);
    return {
      'Subagent Count': stats.subagentCount,
      'Subagent Entries': subagentEntries.length,
    };
  },
  { condition: ({ stats }) => stats.subagentCount > 0 }
);

// Advanced metrics (async condition)
app.enrich('advanced-metrics',
  ({ entries }) => ({
    'Entry Count': entries.length,
    'Avg Entry Size': Math.round(
      entries.reduce((s, e) => s + JSON.stringify(e).length, 0) / entries.length
    ),
  }),
  {
    condition: async ({ entries }) => {
      return entries.length > 10;
    },
  }
);
```

---

## `app.dashboard.view(name, options?)`

Create a named dashboard view. Views group related filters into focused sets. Each view appears as a card on `/dashboard` and has its own route at `/dashboard/[viewName]`.

- **`name`** - unique string identifier for the view
- **`options.label`** - human-readable label displayed on the card (defaults to the name)

Returns a `DashboardViewBuilder` with a chainable `.filter()` method for registering filters within the view.

### `DashboardViewBuilder`

```ts
interface DashboardViewBuilder {
  filter(name: string, fn: FilterFunction, options?: FilterOptions): DashboardViewBuilder;
}
```

The view builder's `.filter()` returns the view builder (not the app), so you can chain multiple filters within a view:

```js
app.dashboard.view('performance', { label: 'Performance Metrics' })
  .filter('turn-count', ({ stats }) => stats.turnCount, { label: 'Turn Count' })
  .filter('tool-calls', ({ stats }) => stats.toolCallCount, { label: 'Tool Calls' });
```

### `ViewOptions`

```ts
interface ViewOptions {
  label?: string;  // Human-readable label (defaults to name)
}
```

### Routing

| URL | Behavior |
|-----|----------|
| `/dashboard` | If named views exist, shows a view index (card grid). If only default filters, shows them directly. If nothing registered, shows an empty state. |
| `/dashboard/[viewName]` | Specific named view with its filters and sessions table. |

### Examples

```js
// Two focused views
app.dashboard.view('performance', { label: 'Performance Metrics' })
  .filter('turn-count', ({ stats }) => stats.turnCount, { label: 'Turn Count' })
  .filter('tool-calls', ({ stats }) => stats.toolCallCount, { label: 'Tool Calls' });

app.dashboard.view('quality', { label: 'Quality Checks' })
  .filter('has-errors', ({ entries }) =>
    entries.some(e => e.type === 'assistant' &&
      Array.isArray(e.message?.content) &&
      e.message.content.some(b => b.type === 'tool_use' && b.is_error)),
    { label: 'Has Errors' })
  .filter('primary-model', ({ stats }) => stats.models[0] || 'unknown',
    { label: 'Primary Model' });

// Backward-compat: app.dashboard.filter() still works (goes to "default" view)
app.dashboard.filter('uses-subagents', ({ stats }) => stats.subagentCount > 0,
  { label: 'Uses Subagents' }
);
```

---

## `app.dashboard.filter(name, fn, options?)`

Register a dashboard filter on the **default** view. For organizing filters into named views, see `app.dashboard.view()` above.

- **`name`** - unique string identifier for the filter
- **`fn`** - function receiving an `EvalContext` and returning a `FilterValue` (`boolean`, `number`, or `string`)
- **`options.label`** - human-readable label for the filter tile (defaults to the name)
- **`options.condition`** - optional condition function to gate this filter

The return type auto-determines the UI control:

| Return type | UI control | Behavior |
|-------------|-----------|----------|
| `boolean` | Three-state toggle | Cycle: All &rarr; Yes &rarr; No &rarr; All |
| `number` | Range slider | Dual-handle slider with min/max inputs |
| `string` | Multi-select dropdown | Checkboxes with Select All / Clear |

Filter values are computed server-side with an incremental index (only new/changed sessions are reprocessed). Filtering and pagination happen server-side, returning only the matching page of results.

### Examples

```js
// Boolean filter: toggle sessions that have tool errors
app.dashboard.filter('has-errors', ({ entries }) =>
  entries.some(e =>
    e.type === 'assistant' &&
    Array.isArray(e.message?.content) &&
    e.message.content.some(b => b.type === 'tool_use' && b.is_error)
  ),
  { label: 'Has Errors' }
);

// Number filter: range slider for turn count
app.dashboard.filter('turn-count', ({ stats }) => stats.turnCount,
  { label: 'Turn Count' }
);

// String filter: multi-select for primary model
app.dashboard.filter('primary-model', ({ stats }) => stats.models[0] || 'unknown',
  { label: 'Primary Model' }
);

// Number filter: range slider for tool call count
app.dashboard.filter('tool-calls', ({ stats }) => stats.toolCallCount,
  { label: 'Tool Calls' }
);

// Boolean filter: sessions with subagents
app.dashboard.filter('uses-subagents', ({ stats }) => stats.subagentCount > 0,
  { label: 'Uses Subagents' }
);

// String filter: session duration bucket
app.dashboard.filter('duration-bucket', ({ stats }) => {
  const ms = parseInt(stats.duration) || 0;
  if (ms < 60000) return 'Under 1m';
  if (ms < 300000) return '1-5m';
  if (ms < 900000) return '5-15m';
  return 'Over 15m';
}, { label: 'Duration' });

// With a per-filter condition: only compute for non-empty sessions
app.dashboard.filter('avg-tools-per-turn',
  ({ stats }) => stats.turnCount > 0
    ? Math.round(stats.toolCallCount / stats.turnCount * 10) / 10
    : 0,
  {
    label: 'Avg Tools/Turn',
    condition: ({ entries }) => entries.length > 0,
  }
);
```

### How It Works

1. When the `/dashboard` page loads, the server action discovers all projects and sessions
2. An incremental `DashboardIndex` diffs the discovered sessions against previously computed rows — only new or changed sessions are processed (unchanged sessions are skipped entirely)
3. For new/changed sessions, it checks the per-session disk cache first, then falls back to parsing the JSONL log and running filters
4. Filter metadata (min/max for numbers, unique values for strings) is rebuilt from accumulators only when the session set changes
5. Server-side filtering and pagination are applied — only the matching page of results is sent to the client
6. User interactions (toggle, slider, dropdown) trigger a debounced (300ms) server re-fetch with the new filter state

### Global Condition

Dashboard filters respect the global condition set via `app.condition()`. If the global condition returns `false` for a session, all filters are skipped for that session.

```js
// Skip empty sessions across evals, enrichments, AND dashboard filters
app.condition(({ entries }) => entries.length > 0);
```

---

## `app.dashboard.aggregate(name, definition, options?)`

Register a cross-session aggregate on the **default** view. For organizing aggregates into named views, use `app.dashboard.view().aggregate()`.

- **`name`** - unique string identifier for the aggregate
- **`definition`** - a `{ collect, reduce }` object
- **`options.label`** - human-readable label for the aggregate section (defaults to the name)
- **`options.condition`** - optional condition function to gate this aggregate per session

### Example

Provide a `{ collect, reduce }` object. The `collect` function runs per session, and `reduce` transforms all collected values into your output table:

```js
app.dashboard.aggregate('eval-summary', {
  collect: ({ evalResults }) => {
    const result = {};
    for (const [name, r] of Object.entries(evalResults)) {
      result[`${name}_pass`] = r.pass;
      result[`${name}_score`] = r.score;
    }
    return result;
  },
  reduce: (collected) => {
    const evalNames = new Set();
    for (const s of collected) {
      for (const key of Object.keys(s.values)) {
        if (key.endsWith('_pass')) evalNames.add(key.replace('_pass', ''));
      }
    }
    return Array.from(evalNames).map(name => ({
      'Eval': name,
      'Pass Rate': collected.filter(s => s.values[`${name}_pass`]).length / collected.length,
      'Avg Score': collected.reduce((sum, s) => {
        const v = s.values[`${name}_score`];
        return sum + (typeof v === 'number' ? v : 0);
      }, 0) / collected.length,
    }));
  },
});
```

### `app.dashboard.view().aggregate()`

Aggregates can be chained on named views alongside filters:

```js
app.dashboard.view('quality', { label: 'Quality' })
  .aggregate('session-metrics', {
    collect: ({ stats }) => ({
      turnCount: stats.turnCount,
      toolCalls: stats.toolCallCount,
    }),
    reduce: (collected) => {
      const n = collected.length || 1;
      let turns = 0, tools = 0;
      for (const s of collected) {
        turns += typeof s.values.turnCount === 'number' ? s.values.turnCount : 0;
        tools += typeof s.values.toolCalls === 'number' ? s.values.toolCalls : 0;
      }
      return [
        { Metric: 'Avg Turns', Value: +(turns / n).toFixed(1) },
        { Metric: 'Avg Tool Calls', Value: +(tools / n).toFixed(1) },
      ];
    },
  })
  .filter('turns', ({ stats }) => stats.turnCount, { label: 'Turns' });
```

### `AggregateContext`

The collect function receives an extended context:

```ts
interface AggregateContext {
  entries: Record<string, unknown>[];  // Raw JSONL lines
  stats: EvalLogStats;                 // Computed stats
  projectName: string;
  sessionId: string;
  source: string;
  evalResults: Record<string, { pass: boolean; score: number; error?: string; message?: string }>;
  enrichResults: Record<string, Record<string, EnrichmentValue>>;
  filterValues: Record<string, FilterValue>;
}
```

### `AggregateValue`

```ts
type AggregateValue = boolean | number | string;
```

### `AggregateCollectFunction`

```ts
type AggregateCollectFunction = (
  context: AggregateContext,
) => Record<string, AggregateValue> | Promise<Record<string, AggregateValue>>;
```

### `AggregateReduceFunction`

```ts
type AggregateReduceFunction = (
  collected: CollectedSession[],
) => AggregateTableRow[] | Promise<AggregateTableRow[]>;
```

### `AggregateDefinition`

```ts
type AggregateDefinition = {
  collect: AggregateCollectFunction;
  reduce: AggregateReduceFunction;
};
```

### `AggregateOptions`

```ts
interface AggregateOptions {
  label?: string;
  condition?: ConditionFunction;
}
```

### `CollectedSession`

```ts
interface CollectedSession {
  projectName: string;
  sessionId: string;
  values: Record<string, AggregateValue>;
}
```

### `AggregateTableRow`

```ts
type AggregateTableRow = Record<string, AggregateValue>;
```

### `AggregatePayload`

```ts
interface AggregatePayload {
  aggregates: {
    name: string;
    label: string;
    rows: AggregateTableRow[];
    columns: string[];
  }[];
  totalSessions: number;
  totalDurationMs: number;
}
```

---

## `app.auth(options)`

Configure username/password authentication. When at least one user is configured (via `app.auth()`, `--auth-user`, or `CLAUDEYE_AUTH_USERS` env var), all UI routes are protected by a login page. Users from all sources are merged.

- **`options.users`** - array of `{ username: string; password: string }` objects

```ts
app.auth({ users: [
  { username: 'admin', password: 'secret' },
  { username: 'viewer', password: 'readonly' },
] });
```

Chainable — returns the app instance:

```js
app
  .auth({ users: [{ username: 'admin', password: 'secret' }] })
  .eval('my-eval', fn)
  .listen();
```

When auth is active:
- All UI routes redirect to `/login` for unauthenticated users
- A signed HMAC-SHA256 session cookie (`claudeye_session`) is set on login, with 24h expiry
- The navbar shows a **Sign out** button
- If no users are configured, auth is completely disabled (no login page, no blocking)

### Multiple sources

Users from CLI, environment, and API are merged:

```bash
# CLI
claudeye --evals ./my-evals.js --auth-user ops:pass123

# Environment (comma-separated user:password pairs)
CLAUDEYE_AUTH_USERS=admin:secret claudeye --evals ./my-evals.js

# API (in my-evals.js)
app.auth({ users: [{ username: 'dev', password: 'devpass' }] });
```

All three users (`ops`, `admin`, `dev`) would be valid.

---

## `app.listen(port?, options?)`

Start the Claudeye dashboard server.

- **`port`** - port number (default: 8020)
- **`options.host`** - bind address (default: `"localhost"`, use `"0.0.0.0"` for LAN)
- **`options.open`** - auto-open browser (default: `true`)

When the file is loaded via `--evals` or `CLAUDEYE_EVALS_MODULE`, `listen()` is a no-op. It won't spawn a duplicate server.

```js
const app = createApp();

app.eval('my-eval', fn);
app.enrich('my-enricher', fn);

// Only starts a server when run directly with `node`
app.listen(3000, { host: '0.0.0.0', open: false });
```

---

## Types

### `EvalContext`

Both evals and enrichers receive the same context object:

```ts
interface EvalContext {
  entries: Record<string, unknown>[];  // Combined session + subagent JSONL lines, each tagged with `_source`
  stats: EvalLogStats;                 // Computed stats across all entries (session + subagent)
  projectName: string;                 // Encoded project folder name
  sessionId: string;                   // Session UUID
  source: string;                      // "session" or "agent-{id}" — matches entry._source directly
  subagentType?: string;               // e.g. 'Explore', 'Bash' (subagent scope only)
  subagentDescription?: string;        // Short description (subagent scope only)
  parentSessionId?: string;            // Parent session ID (subagent scope only)
}
```

`entries` contains the **raw JSONL data** from the session and all its subagents combined. Every line from the session log file and its subagent log files is parsed as JSON and included. Each entry has a `_source` field: `"session"` for main session entries, or `"agent-{id}"` for subagent entries. This means:

- Tool-result lines (which the display view merges into tool_use blocks) are present as separate entries
- All entry types are included: `user`, `assistant`, `system`, `tool_result`, `queue-operation`, etc.
- Properties are accessed directly (e.g. `e.usage?.total_tokens`) rather than through a `.raw` wrapper
- Filter by `e._source === "session"` to get only main session data
- Filter by `e._source` starting with `"agent-"` to get subagent data

### `EvalLogEntry` (helper type)

`EvalLogEntry` is exported as a convenience type for describing the display-oriented parsed entries, but it is **not** the type of `EvalContext.entries`. The entries passed to evals and enrichments are raw JSONL objects (`Record<string, unknown>[]`).

```ts
interface EvalLogEntry {
  type: string;
  _source?: string;  // "session" or "agent-{id}"
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  timestampMs: number;
  timestampFormatted: string;
  message?: {
    role: string;
    content: string | EvalContentBlock[];
    model?: string;
  };
  raw?: Record<string, unknown>;
  label?: string;
}
```

### `EvalLogStats`

> Stats are computed across all entries (session + subagent combined). Use `_source` filtering on entries before computing custom scoped metrics if needed.

```ts
interface EvalLogStats {
  turnCount: number;      // Number of conversation turns
  userCount: number;      // Number of user messages
  assistantCount: number; // Number of assistant responses
  toolCallCount: number;  // Total tool invocations
  subagentCount: number;  // Number of subagent spawns
  duration: string;       // Formatted duration (e.g. "2m 15s")
  models: string[];       // Distinct model IDs used
}
```

### `EvalResult`

```ts
interface EvalResult {
  pass: boolean;                          // Did the eval pass?
  score?: number;                         // 0-1, clamped automatically (default: 1.0)
  message?: string;                       // Shown in the UI
  metadata?: Record<string, unknown>;     // Arbitrary data
}
```

### `EnrichmentResult`

```ts
// Enrichers return a flat key-value map
type EnrichmentResult = Record<string, string | number | boolean>;
```

### `ConditionFunction`

```ts
type ConditionFunction = (context: EvalContext) => boolean | Promise<boolean>;
```

### `FilterValue`

```ts
type FilterValue = boolean | number | string;
```

### `FilterFunction`

```ts
type FilterFunction = (context: EvalContext) => FilterValue | Promise<FilterValue>;
```

### `FilterOptions`

```ts
interface FilterOptions {
  label?: string;                // Human-readable tile label (defaults to name)
  condition?: ConditionFunction; // Per-filter gate
}
```

### `FilterMeta`

Metadata auto-derived from computed filter values. Discriminated union by `type`:

```ts
type FilterMeta =
  | { type: 'boolean'; name: string; label: string }
  | { type: 'number';  name: string; label: string; min: number; max: number }
  | { type: 'string';  name: string; label: string; values: string[] };
```

### `DashboardPayload`

```ts
interface DashboardPayload {
  sessions: DashboardSessionRow[];  // One page of matching sessions
  filterMeta: FilterMeta[];         // One per registered filter
  totalDurationMs: number;          // Server-side computation time
  totalCount: number;               // Total sessions before filtering
  matchingCount: number;            // Total sessions after filtering
  page: number;                     // Current page (1-based)
  pageSize: number;                 // Items per page
}

interface DashboardSessionRow {
  projectName: string;
  sessionId: string;
  lastModified: string;             // ISO 8601
  lastModifiedFormatted: string;    // Human-readable
  filterValues: Record<string, FilterValue>;
}
```

---

## Evaluation Order

When a session is loaded, conditions are evaluated in this order:

```
1. Global condition checked
   |-- Returns false or throws -> ALL evals/enrichments marked "skipped"
   \-- Returns true -> proceed to step 2

2. For each eval/enrichment:
   |-- Has per-item condition?
   |   |-- Returns false -> that item marked "skipped"
   |   |-- Throws -> that item marked "errored" (not skipped)
   |   \-- Returns true -> run the function
   \-- No condition -> run the function

3. Function executes
   |-- Returns result -> recorded normally
   \-- Throws -> marked "errored", other items still run
```

---

## UI Behavior

In the dashboard, conditional results appear as follows:

| Status | Evals Panel | Enrichments Panel |
|--------|-------------|-------------------|
| **Skipped** | Grayed-out row with "skipped" label | Grayed-out row with "skipped" label |
| **Condition error** | Row with warning icon and error message | Row with warning icon and error message |
| **Passed / Data** | Green check with score bar | Key-value pairs grouped by enricher |
| **Failed** | Red X with score bar | N/A |

Skipped items are counted separately in the summary bar (e.g. "2 passed, 1 skipped").

---

## Subagent Scope

### Scope Options

The `scope` option controls when an eval or enrichment runs:

| Scope | Runs at session level | Runs at subagent level |
|-------|:---:|:---:|
| `'session'` (default) | Yes | No |
| `'subagent'` | No | Yes |
| `'both'` | Yes | Yes |

### Subagent Context

When running at subagent level, the `EvalContext` includes additional metadata:

```js
app.eval('adaptive-eval', (ctx) => {
  if (ctx.source !== 'session') {
    // Running at subagent level — source is "agent-{id}"
    console.log(ctx.source);              // e.g. 'agent-a1b2c3'
    console.log(ctx.subagentType);        // e.g. 'Explore'
    console.log(ctx.subagentDescription); // e.g. 'Search for auth code'
    console.log(ctx.parentSessionId);     // parent session ID
  }
  return { pass: true };
}, { scope: 'both' });
```

### Combined Data in Subagent Scope

Subagent-scoped evals and enrichments receive the full combined data (session + all subagents), not just the subagent's own entries. The `source` field in `EvalContext` directly matches the `_source` value on entries, so you can filter easily:

```js
// Subagent-scoped eval that filters to its own entries
app.eval('explore-thoroughness', ({ entries, source }) => {
  const myEntries = entries.filter(e => e._source === source);
  return {
    pass: myEntries.length > 5,
    score: Math.min(myEntries.length / 20, 1),
  };
}, { scope: 'subagent', subagentType: 'Explore' });
```

### SubagentType Filtering

When you specify `subagentType`, the eval/enrichment only runs for subagents of that type. Subagents of other types will not see the eval panel at all.

```js
// Only runs for Explore subagents
app.eval('explore-thoroughness', ({ entries, source }) => {
  const myEntries = entries.filter(e => e._source === source);
  return {
    pass: myEntries.length > 5,
    score: Math.min(myEntries.length / 20, 1),
    message: `${myEntries.length} entries explored`,
  };
}, { scope: 'subagent', subagentType: 'Explore' });

// Runs for all subagent types
app.eval('agent-efficiency', ({ stats }) => ({
  pass: stats.turnCount <= 10,
  score: Math.max(0, 1 - stats.turnCount / 20),
  message: `${stats.turnCount} turns`,
}), { scope: 'subagent' });

// Subagent-scoped enrichment
app.enrich('agent-summary',
  ({ stats, entries }) => ({
    'Agent Turns': stats.turnCount,
    'Agent Tool Calls': stats.toolCallCount,
    'Agent Entries': entries.length,
  }),
  { scope: 'subagent' }
);

// Scoped to both session and subagent level
app.eval('quality-check', ({ stats, source }) => ({
  pass: stats.toolCallCount <= 20,
  score: Math.max(0, 1 - stats.toolCallCount / 40),
  message: `${source}: ${stats.toolCallCount} tool calls`,
}), { scope: 'both' });
```

### UI Behavior

When a subagent is expanded in the log viewer, eval and enrichment panels appear below the stats bar (only if matching subagent-scoped evals/enrichments are registered). Panels use a compact layout to fit within the nested subagent view. If no subagent-scoped evals match the subagent's type, the panels are not rendered.

### Caching

Subagent eval/enrichment results are cached separately from session results:

```
~/.claudeye/cache/evals/{project}/{sessionId}.json              # session-level
~/.claudeye/cache/evals/{project}/{sessionId}/agent-{id}.json   # subagent-level
```

Cache invalidation works the same way, based on the subagent log file's mtime+size and the evals module content hash.

### Edge Cases

- **No subagents in session**: Subagent-scoped evals never run. Panels only mount inside expanded subagent cards.
- **`scope: 'both'` with `subagentType`**: At session level, the `subagentType` filter is ignored. At subagent level, it applies.
- **Conditions + scope**: Scope filtering happens first (registry level), then conditions run with the full `EvalContext`.
- **Backward compatibility**: Existing evals with no `scope` option default to `'session'`. Behavior is unchanged.

---

## Full Example

A complete evals file combining evals, enrichments, dashboard views, conditions, and subagent scope:

```js
import { createApp } from 'claudeye';

const app = createApp();

// Global condition: require at least one user message
app.condition(({ entries }) =>
  entries.some(e => e.type === 'user')
);

// --- Session-level evals ---

app.eval('has-completion', ({ entries }) => {
  const lastAssistant = [...entries].reverse().find(e => e.type === 'assistant');
  const hasText = lastAssistant?.message?.content?.some?.(b => b.type === 'text');
  return {
    pass: !!hasText,
    score: hasText ? 1.0 : 0,
    message: hasText ? 'Session completed with text response' : 'No final text response',
  };
});

app.eval('tool-success-rate',
  ({ entries }) => {
    const toolResults = entries.filter(e =>
      e.type === 'user' &&
      Array.isArray(e.message?.content) &&
      e.message.content.some(b => b.type === 'tool_result')
    );
    const errors = toolResults.filter(e =>
      e.message?.content?.some(b => b.is_error === true)
    );
    const rate = toolResults.length > 0 ? 1 - (errors.length / toolResults.length) : 1;
    return {
      pass: rate >= 0.9,
      score: rate,
      message: `${errors.length}/${toolResults.length} tool errors`,
    };
  },
  { condition: ({ stats }) => stats.toolCallCount > 0 }
);

app.eval('under-budget',
  ({ stats }) => ({
    pass: stats.turnCount <= 30,
    score: Math.max(0, 1 - stats.turnCount / 60),
    message: `${stats.turnCount} turns`,
  }),
  { condition: ({ stats }) => stats.turnCount >= 5 }
);

// --- Session-level enrichments ---

app.enrich('overview', ({ stats }) => ({
  'Turns': stats.turnCount,
  'Tool Calls': stats.toolCallCount,
  'Duration': stats.duration,
  'Models': stats.models.join(', ') || 'none',
}));

app.enrich('subagent-info',
  ({ stats }) => ({
    'Subagent Count': stats.subagentCount,
  }),
  { condition: ({ stats }) => stats.subagentCount > 0 }
);

// --- Dashboard views (visible at /dashboard) ---

// Performance view: turn & tool metrics with aggregates
app.dashboard.view('performance', { label: 'Performance Metrics' })
  .aggregate('session-metrics', {
    collect: ({ stats }) => ({
      turnCount: stats.turnCount,
      toolCalls: stats.toolCallCount,
    }),
    reduce: (collected) => {
      const n = collected.length || 1;
      let turns = 0, tools = 0;
      for (const s of collected) {
        turns += typeof s.values.turnCount === 'number' ? s.values.turnCount : 0;
        tools += typeof s.values.toolCalls === 'number' ? s.values.toolCalls : 0;
      }
      return [
        { Metric: 'Avg Turns', Value: +(turns / n).toFixed(1) },
        { Metric: 'Avg Tool Calls', Value: +(tools / n).toFixed(1) },
        { Metric: 'Total Sessions', Value: collected.length },
      ];
    },
  }, { label: 'Session Metrics' })
  .filter('turn-count', ({ stats }) => stats.turnCount, { label: 'Turn Count' })
  .filter('tool-calls', ({ stats }) => stats.toolCallCount, { label: 'Tool Calls' });

// Quality view: error & model filters
app.dashboard.view('quality', { label: 'Quality Checks' })
  .filter('has-errors', ({ entries }) =>
    entries.some(e =>
      e.type === 'assistant' &&
      Array.isArray(e.message?.content) &&
      e.message.content.some(b => b.type === 'tool_use' && b.is_error)
    ),
    { label: 'Has Errors' })
  .filter('primary-model', ({ stats }) => stats.models[0] || 'unknown',
    { label: 'Primary Model' });

// Backward-compat: app.dashboard.filter() still works (goes to "default" view)
app.dashboard.filter('uses-subagents', ({ stats }) => stats.subagentCount > 0,
  { label: 'Uses Subagents' }
);

// --- Subagent-scoped evals ---

// Filter to this subagent's entries using source
app.eval('explore-thoroughness', ({ entries, source }) => {
  const myEntries = entries.filter(e => e._source === source);
  return {
    pass: myEntries.length > 5,
    score: Math.min(myEntries.length / 20, 1),
    message: `${myEntries.length} entries for ${source}`,
  };
}, { scope: 'subagent', subagentType: 'Explore' });

// Compare subagent vs session tool usage
app.eval('agent-efficiency', ({ entries, source, stats }) => {
  const agentTools = entries
    .filter(e => e._source === source && e.type === 'assistant')
    .flatMap(e => (e.message?.content || []).filter(b => b.type === 'tool_use'));
  return {
    pass: agentTools.length <= 10,
    score: Math.max(0, 1 - agentTools.length / 20),
    message: `${agentTools.length} tool calls by ${source}`,
  };
}, { scope: 'subagent' });

// --- Subagent-scoped enrichments ---

// Use source to scope entry counts
app.enrich('agent-summary', ({ entries, source, stats }) => ({
  'Source': source,
  'Agent Entries': entries.filter(e => e._source === source).length,
  'Agent Turns': stats.turnCount,
  'Agent Tool Calls': stats.toolCallCount,
}), { scope: 'subagent' });
```

---

## Tips

- Each eval, enricher, and filter is wrapped in a try/catch. If one throws, the others still run and the error is shown in the UI.
- Eval scores are clamped to 0-1. If you don't provide a score, it defaults to 1.0.
- Eval, enricher, filter, and condition functions can all be async.
- Re-registering with the same name replaces the previous function.
- Click "Re-run" in either panel to re-execute against the current session (always bypasses cache).
- You can mix `app.eval()`, `app.enrich()`, `app.condition()`, `app.dashboard.filter()`, `app.dashboard.view()`, and `app.dashboard.aggregate()` calls freely in the same file.
- Per-item condition errors are treated as eval/enrichment errors (not skips), so you'll see the error message in the UI.
- Dashboard filter return types are auto-detected from the first non-null value: `boolean` &rarr; toggle, `number` &rarr; range slider, `string` &rarr; multi-select.
- Filter values are computed incrementally server-side (only new/changed sessions). Filtering and pagination also happen server-side, with debounced re-fetches on filter changes.
- Use `app.dashboard.view()` to organize filters into focused groups. Each view gets its own `/dashboard/[viewName]` route.
- The same filter name can be used in different views without conflict.
- `app.dashboard.filter()` registers to the "default" view for backward compatibility.
- `app.dashboard.aggregate()` works with both default and named views. Always provide `{ collect, reduce }` for full control over the output table.
- Aggregate collect functions receive `AggregateContext` with eval/enrichment/filter results. Computation is incremental and uses a separate execution path from filters.
- `entries` contains combined session + subagent data. Each entry has `_source` (`"session"` or `"agent-{id}"`). Use `source` from the context to filter: `entries.filter(e => e._source === source)`.
