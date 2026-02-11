# Claudeye API Reference

Full API documentation for Claudeye's custom evals and enrichments system. For a quick overview, see the [README](../README.md).

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
  entries: Record<string, unknown>[];  // Raw JSONL lines (one parsed JSON object per line)
  stats: EvalLogStats;                 // Computed stats (turn count, tool calls, etc.)
  projectName: string;                 // Encoded project folder name
  sessionId: string;                   // Session UUID
  scope: 'session' | 'subagent';      // Whether running at session or subagent level
  subagentId?: string;                 // Hex ID of the subagent (subagent scope only)
  subagentType?: string;               // e.g. 'Explore', 'Bash' (subagent scope only)
  subagentDescription?: string;        // Short description (subagent scope only)
  parentSessionId?: string;            // Parent session ID (subagent scope only)
}
```

`entries` contains the **raw JSONL data**. Every line from the session log file is parsed as JSON and included with no filtering or transformation. This means:

- Tool-result lines (which the display view merges into tool_use blocks) are present as separate entries
- All entry types are included: `user`, `assistant`, `system`, `tool_result`, `queue-operation`, etc.
- Properties are accessed directly (e.g. `e.usage?.total_tokens`) rather than through a `.raw` wrapper

### `EvalLogEntry` (helper type)

`EvalLogEntry` is exported as a convenience type for describing the display-oriented parsed entries, but it is **not** the type of `EvalContext.entries`. The entries passed to evals and enrichments are raw JSONL objects (`Record<string, unknown>[]`).

```ts
interface EvalLogEntry {
  type: string;
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
  if (ctx.scope === 'subagent') {
    console.log(ctx.subagentId);          // e.g. 'a1b2c3'
    console.log(ctx.subagentType);        // e.g. 'Explore'
    console.log(ctx.subagentDescription); // e.g. 'Search for auth code'
    console.log(ctx.parentSessionId);     // parent session ID
  }
  return { pass: true };
}, { scope: 'both' });
```

### SubagentType Filtering

When you specify `subagentType`, the eval/enrichment only runs for subagents of that type. Subagents of other types will not see the eval panel at all.

```js
// Only runs for Explore subagents
app.eval('explore-thoroughness', ({ entries }) => ({
  pass: entries.length > 5,
  score: Math.min(entries.length / 20, 1),
  message: `${entries.length} entries explored`,
}), { scope: 'subagent', subagentType: 'Explore' });

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
app.eval('quality-check', ({ stats, scope }) => ({
  pass: stats.toolCallCount <= 20,
  score: Math.max(0, 1 - stats.toolCallCount / 40),
  message: `${scope}: ${stats.toolCallCount} tool calls`,
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
- **Conditions + scope**: Scope filtering happens first (registry level), then conditions run with the full `EvalContext` including scope metadata.
- **Backward compatibility**: Existing evals with no `scope` option default to `'session'`. Behavior is unchanged.

---

## Full Example

A complete evals file combining evals, enrichments, conditions, and subagent scope:

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

// --- Subagent-scoped evals ---

app.eval('explore-thoroughness', ({ entries }) => ({
  pass: entries.length > 5,
  score: Math.min(entries.length / 20, 1),
}), { scope: 'subagent', subagentType: 'Explore' });

app.eval('agent-efficiency', ({ stats }) => ({
  pass: stats.turnCount <= 10,
  score: Math.max(0, 1 - stats.turnCount / 20),
}), { scope: 'subagent' });

// --- Subagent-scoped enrichments ---

app.enrich('agent-summary', ({ stats }) => ({
  'Agent Turns': stats.turnCount,
  'Agent Tool Calls': stats.toolCallCount,
}), { scope: 'subagent' });
```

---

## Tips

- Each eval and enricher is wrapped in a try/catch. If one throws, the others still run and the error is shown in the UI.
- Eval scores are clamped to 0-1. If you don't provide a score, it defaults to 1.0.
- Both eval and enricher functions can be async.
- Condition functions can also be async.
- Re-registering with the same name replaces the previous function.
- Click "Re-run" in either panel to re-execute against the current session (always bypasses cache).
- You can mix `app.eval()`, `app.enrich()`, and `app.condition()` calls freely in the same file.
- Per-item condition errors are treated as eval/enrichment errors (not skips), so you'll see the error message in the UI.
