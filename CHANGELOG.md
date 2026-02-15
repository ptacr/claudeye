# Changelog

## 0.5.2

- **Breaking:** `subagentId` removed from `EvalContext`. Use `source` field instead — it directly matches `entry._source` (`"session"` or `"agent-{id}"`)
- Updated all examples to use `source` for subagent entry filtering

## 0.5.1

- **Breaking:** `scope` removed from `EvalContext`. Replaced with `source` field (`"session"` or `"agent-{id}"`) that directly matches `entry._source` for easy filtering
- Subagent-scoped evals/enrichments can now filter entries with `entries.filter(e => e._source === source)` — no template literal needed

## 0.5.0 - Unified Session + Subagent Data Model

### Breaking Changes

- `entries` passed to evals, enrichments, conditions, and dashboard filters now contains **combined** session + subagent data (previously session-only for session-scoped items, agent-only for subagent-scoped items)
- Each entry has a `_source` field: `"session"` or `"agent-{id}"`
- `stats` (EvalLogStats) now reflects combined totals
- Subagent logs are loaded eagerly at parse time instead of on-demand
- `loadSubagentLog` server action removed (subagent data is pre-loaded)

### How to Migrate

If your evals relied on receiving only session data, add a `_source` filter:

```js
// Before (implicit session-only):
app.eval('my-eval', ({ entries }) => { ... });

// After (explicit session-only):
app.eval('my-eval', ({ entries }) => {
  const sessionEntries = entries.filter(e => e._source === 'session');
  ...
});
```

## 0.4.0 - Authentication and Filters

### Authentication

- Opt-in username/password auth that protects all UI routes
- `app.auth({ users: [...] })` programmatic API, chainable with other builder methods
- `--auth-user admin:secret` CLI flag (repeatable for multiple users)
- `CLAUDEYE_AUTH_USERS=admin:secret,user2:pass2` environment variable
- All three sources merge: CLI + env + API users are combined
- `/login` page with centered card UI, styled with existing design tokens
- Signed HMAC-SHA256 session cookie with 24h expiry (Edge-compatible via Web Crypto API)
- Next.js middleware redirects unauthenticated users to `/login` with `?from=` for post-login redirect
- Navbar shows **Sign out** button when auth is active
- No auth configured = everything works exactly as before (zero breaking changes)

### Multiple Named Dashboard Views

- `app.dashboard.view(name, options?)` to create named dashboard views with focused sets of filters
- `DashboardViewBuilder` with chainable `.filter()` for registering filters within a view
- `/dashboard` shows a view index (card grid) when named views are registered
- `/dashboard/[viewName]` renders a specific view with its filters and sessions table
- Backward compatible: `app.dashboard.filter()` still works, registers to the "default" view
- When only default filters exist (no named views), `/dashboard` renders them directly
- `listDashboardViews()` server action returns view info with filter counts
- `computeDashboard(viewName?)` accepts an optional view name to scope filters
- New types: `ViewOptions`, `RegisteredView`, `DashboardViewInfo`
- See `examples/multi-view-dashboard.js` for a complete sample

### Dashboard Filters

- `app.dashboard.filter(name, fn, options?)` to register cross-project filters visible at `/dashboard`
- **Boolean filters** render as three-state toggle tiles (All / Yes / No)
- **Number filters** render as dual-handle range sliders with min/max text inputs
- **String filters** render as multi-select dropdown tiles with Select All / Clear actions
- Return type auto-determines the UI control — no manual configuration needed
- Filter values computed server-side, filtering happens client-side for instant interaction
- `FilterMeta` auto-derived from data: min/max for numbers, unique values for strings
- Per-filter conditions via `options.condition` to gate individual filters
- Global condition (`app.condition()`) respected — skips all filters for non-matching sessions
- Sessions table with dynamic columns for each filter value, pagination, and project/session links
- Navigation bar updated with Projects and Dashboard links
- Individual error isolation — one failing filter doesn't block others
- See `examples/dashboard-filters.js` for a complete sample

## 0.3.3 - First Public Release

### Dashboard

- **Projects & sessions browser** with keyword search, date range presets (Last Hour, Today, 7 Days, 30 Days), custom date picker, and pagination (25 per page)
- **Full execution trace viewer** showing every message, tool call, thinking block, and system event
- **Virtual scrolling** for sessions with thousands of entries without performance issues
- **Session stats bar** showing turns, user/assistant messages, tool calls, subagents, duration, and models
- **Nested subagent logs** with lazy loading and inline expansion
- **Tool I/O cards** with collapsible input/output, timestamps, duration, and copy buttons
- **Thinking block support** with character count and collapsible display
- **JSONL download** for raw session logs
- **Auto-refresh** at 5s, 10s, or 30s intervals
- **Light/dark theme** with system preference detection and localStorage persistence
- **Pagination controls** with smart page number strip

### Custom Evals

- `app.eval(name, fn, options?)` to grade sessions with pass/fail, 0-1 scores, and messages
- Global conditions via `app.condition(fn)` to skip all evals for certain sessions
- Per-eval conditions to gate individual evals
- Scope control: `session`, `subagent`, or `both`
- Subagent type filtering (e.g. only run for `Explore` subagents)
- Individual error isolation so one failing eval doesn't block others
- Results panel with score bars, pass/fail counts, duration, and expandable details

### Custom Enrichments

- `app.enrich(name, fn, options?)` to compute key-value metadata displayed in the dashboard
- Same scope and condition system as evals
- Grid layout with formatted values (booleans as Yes/No, localized numbers)

### Caching

- On by default, cached to `~/.claudeye/cache/`
- Automatic invalidation when session files, eval code, or eval registrations change
- `--cache off` to disable, `--cache-path` for custom location, `--cache-clear` to wipe
- Re-run button in dashboard to bypass cache

### CLI

- `claudeye` starts the dashboard at `localhost:8020` and opens the browser
- `--projects-path, -p` for custom Claude projects directory
- `--port` and `--host` for binding (use `0.0.0.0` for LAN access)
- `--evals` to load custom evals/enrichments
- `--no-open` to skip browser auto-open
- Automatic port fallback if preferred port is busy
- `app.listen()` for running evals files directly with `node my-evals.js`

### Security

- Path traversal protection on all file access
- UUID validation for session IDs, hex validation for agent IDs
- Content hash validation for cache entries
