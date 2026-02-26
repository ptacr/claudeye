```
  ____ _                 _
 / ___| | __ _ _   _  __| | ___ _   _  ___
| |   | |/ _` | | | |/ _` |/ _ \ | | |/ _ \
| |___| | (_| | |_| | (_| |  __/ |_| |  __/
 \____|_|\__,_|\__,_|\__,_|\___|\__, |\___|
                                |___/
```

# Claudeye: Watchtower for Claude Code and Claude Agents SDK

**Uncover** what your agents did.
**Understand** where they struggle.
**Utilize** insights to improve.

[![npm version](https://img.shields.io/npm/v/claudeye)](https://www.npmjs.com/package/claudeye)
[![npm downloads](https://img.shields.io/npm/dm/claudeye)](https://www.npmjs.com/package/claudeye)
[![node](https://img.shields.io/node/v/claudeye)](https://nodejs.org)
[![CI](https://img.shields.io/github/actions/workflow/status/exospherehost/claudeye/ci.yml?branch=main&label=CI)](https://github.com/exospherehost/claudeye/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-blue)](https://www.typescriptlang.org/)
[![Discord](https://badgen.net/discord/members/zT92CAgvkj)](https://discord.com/invite/zT92CAgvkj)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

## What is Claudeye?

One command. Full visibility into every Claude agent session.

Claudeye lets you replay agent executions, grade them with custom evals, and surface exactly where reliability breaks down, across both Claude Code and the Agents SDK. Deploy it locally or on your infrastructure. No setup, no config, just `claudeye` and you're in.

## Quick Start

```bash
bun install -g claudeye && claudeye
# or: npm install -g claudeye && claudeye
```

Opens your browser at `localhost:8020`. Reads from `~/.claude/projects` by default.

Works with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions and [Claude Agents SDK](https://github.com/anthropics/anthropic-sdk-python) logs.

## Why Claudeye?

| Feature | Claudeye | Langfuse | Dev-Agent-Lens | ccusage | Raw JSONL |
|---------|:--------:|:--------:|:--------------:|:-------:|:---------:|
| Local-first (no cloud) | **Yes** | Self-host option | Proxy required | Yes | Yes |
| Session replay | **Yes** | Traces only | Traces only | No | Manual |
| Custom evals | **Yes** | Limited | No | No | No |
| Subagent expansion | **Yes** | No | No | No | No |
| Zero config | **Yes** | Setup required | Proxy setup | Yes | N/A |
| Visual dashboard | **Yes** | Yes | Yes (Phoenix) | CLI only | No |

## Features

### Uncover

- **Projects & sessions browser** - filter by date range or keyword, paginated and sorted newest-first
- **Full execution trace viewer** - every message, tool call, thinking block, and system event
- **Nested subagent logs** - expand to see subagent executions inline, pre-loaded with the session
- **Virtual scrolling** - handles sessions with thousands of entries without performance issues

### Understand

- **Session stats bar** - turns, tool calls, subagents, duration, and models at a glance
- **Custom evals** - grade sessions with pass/fail results and 0-1 scores
- **Per-eval recompute** - re-run a single eval without reprocessing all others
- **Conditional evals** - gate evals globally or per-item, with session/subagent scope control

### Utilize

- **Custom enrichments** - compute metadata (token counts, quality signals, labels) as key-value pairs
- **Custom actions** - on-demand tasks triggered from the dashboard via `app.action()` — generate summaries, export metrics, or run side-effects with full access to eval and enrichment results
- **Alerts** - register callbacks via `app.alert()` that fire after all evals and enrichments complete (Slack webhooks, CI notifications, logging)
- **Dashboard views & filters** - organize filters into named views, each with focused filter tiles (boolean toggles, range sliders, multi-select dropdowns) and a filterable sessions table
- **Dashboard aggregates** - define cross-session summary tables with `app.dashboard.aggregate()`, using `{ collect, reduce }` for full control over output
- **Unified queue** - all evals and enrichments (session, subagent, UI, background) go through a single priority queue with bounded concurrency, live tracking at `/queue`
- **JSONL export** - download raw session logs
- **Auto-refresh** - monitor live sessions at 5s, 10s, or 30s intervals
- **Light/dark theme** - with system preference detection

## CLI Reference

| Flag | Description | Default |
|------|-------------|---------|
| `--projects-path, -p <path>` | Path to Claude projects directory | `~/.claude/projects` |
| `--port <number>` | Port to bind | `8020` |
| `--host <address>` | Host to bind (`0.0.0.0` for LAN) | `localhost` |
| `--evals <path>` | Path to evals/enrichments file | - |
| `--auth-user <user:pass>` | Add an auth user (repeatable) | - |
| `--cache <on\|off>` | Enable/disable result caching | `on` |
| `--cache-path <path>` | Custom cache directory | `~/.claudeye/cache` |
| `--cache-clear` | Clear all cached results and exit | - |
| `--no-open` | Don't auto-open the browser | - |
| `--queue-interval <secs>` | Background scan interval in seconds | disabled |
| `--queue-concurrency <num>` | Max parallel items per batch | `2` |
| `--queue-history-ttl <secs>` | Seconds to keep completed items | `3600` |
| `--queue-max-sessions <num>` | Max sessions to process per scan (0=unlimited) | `8` |
| `-h, --help` | Show help | - |

### Examples

```bash
# Custom projects path
claudeye --projects-path /path/to/projects

# Different port, no browser
claudeye --port 3000 --no-open

# LAN access
claudeye --host 0.0.0.0

# Load custom evals and enrichments
claudeye --evals ./my-evals.js

# Password-protect the dashboard
claudeye --auth-user admin:secret

# Multiple auth users
claudeye --auth-user admin:secret --auth-user viewer:readonly

# Clear cached results
claudeye --cache-clear

# Enable background queue processing (scan every 60 seconds)
claudeye --evals ./my-evals.js --queue-interval 60

# Background processing with higher concurrency
claudeye --evals ./my-evals.js --queue-interval 30 --queue-concurrency 5
```

## Custom Evals & Enrichments

Define evals and enrichments in a single JS file and load with `--evals`:

```js
import { createApp } from 'claudeye';

const app = createApp();

// Evals: grade your sessions
app.eval('under-50-turns', ({ stats }) => ({
  pass: stats.turnCount <= 50,
  score: Math.max(0, 1 - stats.turnCount / 100),
  message: `${stats.turnCount} turn(s)`,
}));

app.eval('tool-success', ({ entries }) => {
  const results = entries.filter(e => e.type === 'tool_result');
  const errors = results.filter(e => e.is_error);
  const rate = results.length ? 1 - errors.length / results.length : 1;
  return { pass: rate >= 0.9, score: rate };
});

// Enrichments: add metadata to sessions
app.enrich('session-summary', ({ entries, stats }) => ({
  'Total Tokens': entries.reduce((s, e) => s + (e.usage?.total_tokens || 0), 0),
  'Primary Model': stats.models[0] || 'unknown',
  'Tool Calls': stats.toolCallCount,
}));
```

```bash
claudeye --evals ./my-evals.js
```

### Evals

Evals grade sessions with a pass/fail result and an optional 0-1 score. Each eval receives an `EvalContext` with the session's raw JSONL `entries` and computed `stats`. Return `{ pass, score?, message? }`.

```js
app.eval('has-final-response', ({ entries }) => {
  const last = [...entries].reverse().find(e => e.type === 'assistant');
  const hasText = last?.message?.content?.some?.(b => b.type === 'text');
  return {
    pass: !!hasText,
    score: hasText ? 1.0 : 0,
    message: hasText ? 'Session ended with a text response' : 'No final text response',
  };
});
```

[Read more: Evals API, EvalResult type, and advanced examples &rarr;](docs/api-reference.md#appeval-name-fn-options)

### Enrichments

Enrichments compute key-value metadata displayed in the dashboard. Same `EvalContext` input, return a flat `Record<string, string | number | boolean>`.

```js
app.enrich('session-overview', ({ entries, stats }) => ({
  'Turns': stats.turnCount,
  'Tool Calls': stats.toolCallCount,
  'Models': stats.models.join(', ') || 'none',
  'Total Tokens': entries.reduce((s, e) => s + (e.usage?.total_tokens || 0), 0),
}));
```

[Read more: Enrichments API and EnrichmentResult type &rarr;](docs/api-reference.md#appenrich-name-fn-options)

### Actions

Actions are a flexible on-demand primitive — generate summaries, export metrics, run side-effects, or anything that doesn't fit the eval/enrichment model. Actions receive the full session context plus cached eval and enrichment results, and are triggered manually from the dashboard:

```js
app.action('session-summary', ({ stats, evalResults }) => {
  const passCount = Object.values(evalResults).filter(r => r.pass).length;
  return {
    output: `${stats.turnCount} turns, ${passCount}/${Object.keys(evalResults).length} evals passed`,
    data: { turns: stats.turnCount, evalsPassed: passCount },
    status: 'success',
  };
});

// Side-effect action (disable caching so it always re-runs)
app.action('export-report', async ({ projectName, sessionId, stats }) => {
  const fs = await import('fs/promises');
  await fs.appendFile('reports.jsonl', JSON.stringify({ projectName, sessionId, turns: stats.turnCount }) + '\n');
  return { status: 'success', message: 'Report exported' };
}, { cache: false });
```

Actions support the same `condition`, `scope`, `subagentType`, and `cache` options as evals and enrichments.

[Read more: Actions API, ActionContext, and ActionResult types &rarr;](docs/api-reference.md#appaction-name-fn-options)

### Dashboard Views & Filters

Organize dashboard filters into **named views** — each with a focused set of filters. Views appear as cards on `/dashboard` and link to `/dashboard/[viewName]`:

```js
// Named views with chainable .filter()
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

Filter return types (`boolean`, `number`, `string`) auto-determine the UI control: toggle tiles, range sliders, or multi-select dropdowns. Values are computed server-side with an incremental index that only reprocesses new or changed sessions. Filtering and pagination happen server-side, returning only the matching page of results.

[Read more: Dashboard Views API &rarr;](docs/api-reference.md#appdashboardview-name-options)
[Read more: Dashboard Filters API &rarr;](docs/api-reference.md#appdashboardfilter-name-fn-options)

### Dashboard Aggregates

Aggregates compute cross-session summaries. Provide a `{ collect, reduce }` object: `collect` runs per session returning key-value pairs, and `reduce` transforms all collected values into your output table:

```js
app.dashboard.view('quality')
  .aggregate('eval-summary', {
    collect: ({ evalResults }) => {
      const result = {};
      for (const [name, r] of Object.entries(evalResults)) {
        result[`${name}_pass`] = r.pass;
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
      }));
    },
  });
```

The collect function receives an `AggregateContext` with log entries, stats, eval results, enrichment results, and filter values. Computation is incremental — only new/changed sessions are reprocessed.

[Read more: Dashboard Aggregates API &rarr;](docs/api-reference.md#appdashboardaggregate-name-definition-options)

### Alerts

Alerts fire after all evals and enrichments complete for a session. Use them for Slack webhooks, CI notifications, logging, or any post-processing:

```js
app.alert('slack-on-failure', async ({ projectName, sessionId, evalSummary }) => {
  if (evalSummary && evalSummary.failCount > 0) {
    await fetch('https://hooks.slack.com/services/...', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${evalSummary.failCount} evals failed for ${projectName}/${sessionId}`,
      }),
    });
  }
});

app.alert('log-results', ({ projectName, sessionId, evalSummary, enrichSummary }) => {
  console.log(`[${projectName}/${sessionId}] evals: ${evalSummary?.passCount ?? 0} pass, ${evalSummary?.failCount ?? 0} fail`);
});
```

Alerts fire when all evals and enrichments for a session are complete — the unified queue checks after each item. This covers initial page loads, background processing, and all re-run actions. Each alert is individually error-isolated: a throwing callback never blocks other alerts or eval processing.

[Read more: Alerts API and AlertContext type &rarr;](docs/api-reference.md#appalert-name-fn)

### Background Queue Processing

Enable background processing to automatically scan and evaluate all sessions on a timer:

```bash
claudeye --evals ./my-evals.js --queue-interval 60
```

The background processor scans all projects for uncached evals/enrichments and enqueues them individually at LOW priority. UI requests are enqueued at HIGH priority, jumping ahead of background work. Track all queue activity in real-time at `/queue` (three tabs: In Queue, Processing, Processed) or via the navbar dropdown. All queue settings are also available as environment variables (`CLAUDEYE_QUEUE_INTERVAL`, `CLAUDEYE_QUEUE_CONCURRENCY`, `CLAUDEYE_QUEUE_HISTORY_TTL`, `CLAUDEYE_QUEUE_MAX_SESSIONS`).

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDEYE_QUEUE_INTERVAL` | Background scan interval in seconds | disabled |
| `CLAUDEYE_QUEUE_CONCURRENCY` | Max parallel items per batch | `2` |
| `CLAUDEYE_QUEUE_HISTORY_TTL` | Seconds to keep completed items | `3600` |
| `CLAUDEYE_QUEUE_MAX_SESSIONS` | Max sessions to process per scan (0=unlimited) | `8` |

### Conditions

Conditions gate when evals and enrichments run. Set a **global condition** with `app.condition()` to skip everything for certain sessions, or add a **per-item condition** in the options:

```js
// Global: skip empty sessions
app.condition(({ entries }) => entries.length > 0);

// Per-eval: only check tool efficiency when tools were used
app.eval('efficient-tools',
  ({ stats }) => ({
    pass: stats.toolCallCount <= stats.turnCount * 2,
    score: Math.max(0, 1 - (stats.toolCallCount / (stats.turnCount * 4))),
  }),
  { condition: ({ stats }) => stats.toolCallCount > 0 }
);
```

[Read more: Conditions, evaluation order, and UI behavior &rarr;](docs/api-reference.md#appcondition-fn)

### Subagent Scope

Evals and enrichments run at the session level by default. Use the `scope` option to target subagent logs:

| Scope | Session level | Subagent level |
|-------|:---:|:---:|
| `'session'` (default) | Yes | No |
| `'subagent'` | No | Yes |
| `'both'` | Yes | Yes |

```js
// Only runs for Explore subagents
app.eval('explore-depth', ({ entries }) => ({
  pass: entries.length > 5,
  score: Math.min(entries.length / 20, 1),
}), { scope: 'subagent', subagentType: 'Explore' });
```

When running at subagent level, the context includes `source` (matching `entry._source`), `subagentType`, `subagentDescription`, and `parentSessionId`. Note that `entries` and `stats` include combined session + subagent data. Use `source` to filter when you need scope-specific data:

```js
// entries includes all data (session + subagents).
// Use source to filter — it matches entry._source directly:
app.eval('agent-check', ({ entries, source }) => {
  const myEntries = entries.filter(e => e._source === source);
  return { pass: myEntries.length > 0 };
}, { scope: 'subagent' });
```

[Read more: Subagent scope, filtering, caching, and edge cases &rarr;](docs/api-reference.md#subagent-scope)

### `app.listen()`

You can also run your evals file directly with `bun my-evals.js` (or `node my-evals.js`) if you include `app.listen()`. This spawns the dashboard as a child process. When loaded via `--evals`, `listen()` automatically becomes a no-op.

[Full API reference: all types, interfaces, and detailed examples &rarr;](docs/api-reference.md)

## Caching

Caching is **on by default**. Results are cached to `~/.claudeye/cache/` and automatically invalidated when session logs or eval definitions change. Click **Re-run** in the dashboard to bypass the cache.

```bash
claudeye --cache off           # Disable caching
claudeye --cache-path /tmp/cc  # Custom cache location
claudeye --cache-clear         # Clear cache and exit
```

## Authentication

Claudeye ships with **opt-in** username/password auth. When no users are configured, everything works exactly as before — no login page, no blocking.

### Enable via CLI

```bash
# Single user
claudeye --auth-user admin:secret

# Multiple users
claudeye --auth-user admin:secret --auth-user viewer:readonly
```

### Enable via environment variable

```bash
CLAUDEYE_AUTH_USERS=admin:secret claudeye
CLAUDEYE_AUTH_USERS=admin:secret,viewer:readonly claudeye
```

### Enable via the programmatic API

```js
import { createApp } from 'claudeye';

const app = createApp();

app.auth({ users: [
  { username: 'admin', password: 'secret' },
  { username: 'viewer', password: 'readonly' },
] });

app.listen();
```

All three methods can be combined — users from CLI flags, the env var, and `app.auth()` are merged together.

When auth is active, all UI routes redirect to `/login`. After signing in, a signed session cookie (24h expiry) grants access. A **Sign out** button appears in the navbar.

## Deployment with PM2

For production deployments, use PM2 with Bun as the interpreter:

```js
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'claudeye',
    script: 'node_modules/.bin/next',
    args: 'start',
    interpreter: 'bun',
    cwd: '/path/to/claudeye',
    env: {
      PORT: 8020,
      HOSTNAME: '0.0.0.0',
      CLAUDE_PROJECTS_PATH: '/home/user/.claude/projects',
      CLAUDEYE_EVALS_MODULE: './my-evals.js',
      CLAUDEYE_QUEUE_INTERVAL: '60',
    },
  }],
};
```

```bash
# Start
pm2 start ecosystem.config.cjs

# Monitor
pm2 monit

# Auto-restart on reboot
pm2 startup
pm2 save
```

## How It Works

1. `createApp()` + `app.eval()` / `app.enrich()` / `app.action()` / `app.alert()` / `app.condition()` / `app.dashboard.view()` / `app.dashboard.filter()` / `app.dashboard.aggregate()` register functions in global registries
2. When you run `claudeye --evals ./my-file.js`, the server dynamically imports your file, populating the registries
3. All eval/enrichment execution routes through a unified priority queue. Each individual eval and enrichment is a separate queue item. UI requests use HIGH priority; background scanning uses LOW priority
4. Each item runs through: cache check → execute if uncached → cache result → check if session complete → fire alerts if complete
5. The global condition is checked first. If it fails, everything is skipped
6. Per-item conditions are checked individually. Skipped items don't block others
7. Each function is individually error-isolated. If one throws, the others still run
8. After all evals and enrichments complete, registered alerts fire with the complete `AlertContext` (eval summary + enrichment summary)
9. Results are serialized and displayed in separate panels in the dashboard UI
10. Named dashboard views (`/dashboard`) show a view index; each view (`/dashboard/[viewName]`) computes filter values incrementally (only new/changed sessions are processed), then filters and paginates server-side for efficiency
11. Dashboard aggregates run a separate server action that collects per-session values (with eval/enrichment/filter results) and reduces them via user-defined reduce functions into sortable summary tables
12. When `CLAUDEYE_QUEUE_INTERVAL` is set, a background processor scans for uncached items on a timer. Track queue state at `/queue` or via the navbar dropdown

## Contributing

Contributions are welcome! To get started:

```bash
git clone https://github.com/exospherehost/claudeye.git
cd claudeye
bun install
bun run dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide - available scripts, project structure, and PR guidelines.

If you find a bug or have a feature idea, [open an issue](https://github.com/exospherehost/claudeye/issues). Pull requests are appreciated. Please keep changes focused and include a clear description.

Built by [exosphere.host](https://exosphere.host).

## Community

- [Discord](https://discord.com/invite/zT92CAgvkj) - get help and connect with other developers
- [Issues](https://github.com/exospherehost/claudeye/issues) - bug reports and feature requests

## License

MIT + Commons Clause. See [LICENSE](./LICENSE).
