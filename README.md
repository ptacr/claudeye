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
npm install -g claudeye && claudeye
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
- **Conditional evals** - gate evals globally or per-item, with session/subagent scope control

### Utilize

- **Custom enrichments** - compute metadata (token counts, quality signals, labels) as key-value pairs
- **Dashboard views & filters** - organize filters into named views, each with focused filter tiles (boolean toggles, range sliders, multi-select dropdowns) and a filterable sessions table
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

Filter return types (`boolean`, `number`, `string`) auto-determine the UI control: toggle tiles, range sliders, or multi-select dropdowns. Values are computed server-side, then filtering happens client-side for instant interaction.

[Read more: Dashboard Views API &rarr;](docs/api-reference.md#appdashboardview-name-options)
[Read more: Dashboard Filters API &rarr;](docs/api-reference.md#appdashboardfilter-name-fn-options)

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

You can also run your evals file directly with `node my-evals.js` if you include `app.listen()`. This spawns the dashboard as a child process. When loaded via `--evals`, `listen()` automatically becomes a no-op.

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

## How It Works

1. `createApp()` + `app.eval()` / `app.enrich()` / `app.condition()` / `app.dashboard.view()` / `app.dashboard.filter()` register functions in global registries
2. When you run `claudeye --evals ./my-file.js`, the server dynamically imports your file, populating the registries
3. When the dashboard loads a session, server actions run all registered evals and enrichers against the combined raw JSONL lines (session + all subagent logs)
4. The global condition is checked first. If it fails, everything is skipped
5. Per-item conditions are checked individually. Skipped items don't block others
6. Each function is individually error-isolated. If one throws, the others still run
7. Results are serialized and displayed in separate panels in the dashboard UI
8. Named dashboard views (`/dashboard`) show a view index; each view (`/dashboard/[viewName]`) computes filter values across all projects/sessions, then filters client-side for instant interaction

## Contributing

Contributions are welcome! To get started:

```bash
git clone https://github.com/exospherehost/claudeye.git
cd claudeye
npm install
npm run dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide - available scripts, project structure, and PR guidelines.

If you find a bug or have a feature idea, [open an issue](https://github.com/exospherehost/claudeye/issues). Pull requests are appreciated. Please keep changes focused and include a clear description.

Built by [exosphere.host](https://exosphere.host).

## Community

- [Discord](https://discord.com/invite/zT92CAgvkj) - get help and connect with other developers
- [Issues](https://github.com/exospherehost/claudeye/issues) - bug reports and feature requests

## License

MIT + Commons Clause. See [LICENSE](./LICENSE).
