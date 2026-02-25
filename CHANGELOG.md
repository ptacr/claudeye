# Changelog

## 0.6.0

### Unified Queue System

- **Single unified queue:** Replaced the dual queue system (session queue + per-item queue) with a single priority queue. Every individual eval and enrichment — session-scoped, subagent-scoped, UI-triggered, or background-scanned — now passes through one queue with bounded concurrency.
- **Per-item granularity:** The background scanner now enqueues individual uncached evals/enrichments at LOW priority instead of whole sessions. UI requests enqueue at HIGH priority and jump ahead.
- **Subagent queue integration:** Subagent evals and enrichments now route through the unified queue (via `/api/queue-item`) instead of calling server actions directly. New `process-subagent-eval.ts` and `process-subagent-enrichment.ts` single-item workers handle subagent processing.
- **Completed items tracking:** The queue now tracks recently completed items (ring buffer, TTL-pruned) with duration, success/fail status, and error messages. Configurable via `CLAUDEYE_QUEUE_HISTORY_TTL` env var (default: 3600s).
- **Alert integration:** Alerts now fire per-item — after each successful completion, the queue checks if all evals+enrichments for that session are cached and fires alerts when the set is complete.
- **Queue details page:** `/queue` now has three tabs: In Queue, Processing, and Processed. Each shows type badges (EVAL/ENRICHMENT), item names, session links, priority, and timing info.
- **Simplified dropdown:** The navbar queue dropdown shows max 7 processing items with type badges, pending count, and "View details" link. No more `processedCount` display.
- **Dead code removal:** Removed `queue-session.ts`, `run-evals.ts`, `run-enrichments.ts`, `run-session-action.ts`, `run-subagent-evals.ts`, and `run-subagent-enrichments.ts` — all replaced by the unified queue path.

### Bun Migration

- **Runtime:** Switched from Node.js/npm to Bun as the primary runtime and package manager. All scripts now use `bun`/`bunx` instead of `npm`/`npx`.
- **Performance:** Bun's faster event loop benefits the I/O-heavy codebase (session log parsing, background queue, cache validation, eval/enrichment runners).
- **CI:** Updated GitHub Actions workflow to use `oven-sh/setup-bun@v2`.
- **Removed `tsx`:** Bun runs TypeScript natively, eliminating the `tsx` dev dependency.
- **PM2 deployment:** Added PM2 ecosystem config documentation for production deployments with Bun as interpreter.

### Bug Fixes & Robustness

- **Unhandled promise rejections:** Added `.catch()` handlers to all promise chains in `EvalResultsPanel` and `EnrichmentResultsPanel` mount effects. Previously, network errors or server failures during the two-phase loading could cause unhandled rejections and leave the UI in a stuck loading state.
- **Stuck loading on unhappy paths:** `runAll` in both panels now transitions loading items to error state when the server returns `!ok` or `!hasEvals`/`!hasEnrichers`, instead of leaving them as indefinite spinners.
- **`rerunSingleEval` unhappy paths:** Added error fallbacks for all non-exception failure paths (non-ok responses, empty results, missing items). Previously, items would remain stuck in loading state if the re-run returned a non-exception failure.
- **Cached badge preserved on refresh:** Phase 2 cache re-probe now only overwrites items that are still in `loading` state, preventing already-resolved cached items from losing their "cached" badge.
- **Background processor re-entrancy:** Replaced `setInterval` with a self-scheduling `setTimeout` loop in the background queue processor. Previously, if `scanAndEnqueue` + `processBatch` took longer than the interval, overlapping callbacks could cause concurrent queue mutation.

### Alert API

- **New: `app.alert()` API** — register callbacks that fire after all evals and enrichments complete for a session. Alerts receive an `AlertContext` with `projectName`, `sessionId`, `evalSummary`, and `enrichSummary` — the complete data needed to decide whether and how to notify.
- **Session-level firing:** Alerts fire once per session from `processSession()` in the eval queue — the single place where all evals + enrichments complete together. All execution paths route through the queue: initial page loads, background processing, Re-run All, and Re-run single.
- **Error isolation:** Each alert callback is individually try/caught via `Promise.allSettled`. A throwing alert never blocks other alerts or eval processing. Errors are logged to console.
- **Chainable API:** `app.alert('name', fn)` chains with `.eval()`, `.enrich()`, and other builder methods.
- **Types exported:** `AlertContext`, `AlertFunction`, and `RegisteredAlert` are published in the `claudeye` package.

### Progressive Eval & Enrichment Display

- **Progressive loading:** Eval and enrichment panels now show registered item names immediately on page load. Cached results appear instantly; uncached items stream in one-by-one as they complete, rather than blocking the entire panel on the slowest item.
- **Per-item cached badge:** Each eval and enrichment result row shows a "cached" badge when the result was served from cache, giving visibility into cache hit/miss status at a glance.
- **Fast cache probe:** New `checkEvalCacheAndList` and `checkEnrichmentCacheAndList` server actions perform a lightweight cache-only lookup — returning registered names plus any cached results in a single fast round-trip (~10-50ms), without running any evals.
- **Single-enricher execution:** `runEnrichments()` and `runSubagentEnrichments()` now accept an optional `enricherName` parameter to run a single enricher in isolation (mirrors existing eval support).
- **Self-sufficient panels:** `EvalResultsPanel` and `EnrichmentResultsPanel` no longer depend on a parent-provided `initialResult` prop. Each panel independently probes cache and runs uncached items on mount.
- **Removed `runSessionDashboard` batch:** The monolithic server action that blocked on all evals + enrichments across session and subagents has been removed. Panels now fetch data independently, eliminating the "slowest item blocks everything" problem.

## 0.5.6

### Per-Eval Recompute

- **New: per-eval re-run button** — each eval result row now has an individual refresh icon. Click it to recompute just that eval without re-running all others.
- **Single-eval server actions:** `runEvals()` and `runSubagentEvals()` accept an optional `evalName` parameter to run a single eval in isolation, always bypassing cache.
- **Merge-on-return:** The fresh single-eval result is merged into the existing summary in-place — pass/fail/error/skipped counts are recalculated without a full reload.
- **Generic support via `runSessionAction`:** The shared `runSessionAction` helper now accepts `evalName`, filtering items to the requested eval and skipping cache lookup when set.

### Dashboard Aggregates

- **New: `app.dashboard.aggregate()` API** — define cross-session aggregations on dashboard views. Provide a `{ collect, reduce }` object: `collect` runs per session (with access to entries, stats, eval results, enrichment results, and filter values), and `reduce` transforms collected values into a sortable summary table with full control over columns and rows.
- **Incremental computation:** Uses the same incremental index pattern as dashboard filters — only new/changed sessions are reprocessed. Collected values are cached per-session.
- **Rich context:** The collect function receives `AggregateContext` with log entries, stats, eval results, enrichment results, and filter values — everything computed for the session.
- **Sortable tables:** Custom tables support column sorting in the dashboard UI.
- **Chainable API:** `.aggregate()` chains with `.filter()` on views: `app.dashboard.view('quality').aggregate(...).filter(...)`.
- **Zero impact on filters:** Aggregates use a completely separate server action, globalThis index, and execution path — existing filter performance is unaffected.
- **Memory-safe:** Parsed session data is garbage-collected immediately after collect runs. Only small collected key-value pairs are retained in the index.

## 0.5.5

### Performance — High-Performance Dashboard Filters

- **OOM fix:** Dashboard filter computation no longer causes JavaScript heap out-of-memory crashes on large workspaces. Previously, the unbounded runtime cache stored full parsed session data for every session touched, exhausting the Node.js heap.
- **LRU-bounded runtime cache:** `runtimeCache` now accepts an optional `maxSize` parameter with LRU eviction. `getCachedSessionLog` is capped at 20 entries, preventing unbounded memory growth.
- **Incremental dashboard index:** A `DashboardIndex` stored in `globalThis` tracks computed rows by session key. On subsequent calls, only new, changed, or deleted sessions are processed — unchanged sessions are skipped entirely (zero I/O). The index invalidates automatically when the evals module or view configuration changes.
- **Bypass runtime cache for filter computation:** `computeDashboard()` now calls `parseSessionLog()` directly instead of `getCachedSessionLog()`, ensuring parsed JSONL data is garbage-collected immediately after filter computation rather than retained in the runtime cache.
- **Incremental filter meta accumulators:** Filter metadata (min/max for numbers, unique values for strings) is computed incrementally via accumulators instead of accumulating all values in arrays, reducing memory from O(sessions × filters) to O(unique values).

### Server-Side Filtering & Pagination

- **Server-side filtering:** Filter state is now serialized and sent to the server. The `computeDashboard()` action applies filters server-side and returns only the matching page of results, reducing payload size.
- **Server-side pagination:** Pagination moved from client to server. Only one page of `DashboardSessionRow` objects crosses the wire per request.
- **Debounced filter re-fetch:** Client-side filter changes are debounced (300ms) before triggering a server re-fetch, preventing excessive requests during rapid interactions.
- **Persistent filter metadata:** `filterMeta` is preserved across re-fetches so filter tile UI doesn't flash during updates.
- **New types:** `SerializedFilterState`, `SerializedFilters` for type-safe server action parameters. `DashboardPayload` extended with `totalCount`, `matchingCount`, `page`, `pageSize`.

### Tests

- **Runtime cache LRU tests:** New unit tests for `runtimeCache` verifying LRU eviction behavior, access-order promotion, and TTL expiry with bounded caches.

## 0.5.4

### Performance

- **Dashboard:** Session file discovery now runs in parallel (`batchAll`) instead of sequentially, speeding up dashboard load for projects with many sessions
- **Cache:** Per-item cache stores now write in parallel (`batchAll`) instead of sequentially across session actions, subagent evals, and subagent enrichments
- **Cache:** File deletions during cache invalidation now run in parallel
- **Cache:** Subagent file stat calls in `hashSubagentFile` now run in parallel
- **Concurrency:** All parallel I/O operations (project discovery, cache writes, cache invalidation) are now capped via a shared `batchAll` utility to prevent file descriptor exhaustion on large workspaces

### UI Fixes & Improvements

- **UI:** Fixed text overflow in tool name displays - long tool names (e.g., `mcp__vector_store__search_test_cases`) now truncate with ellipsis instead of overflowing
- **UI:** Improved tool statistics grid layout to use full horizontal space with auto-fit columns (`repeat(auto-fit, minmax(200px, 1fr))`), providing more room for long tool names when fewer items are displayed
- **UI:** Added proper flex constraints to prevent icon compression and ensure duration text remains visible
- **UI:** Tool names in both log viewer and statistics grid now use `truncate` and `min-w-0` CSS classes for proper text overflow handling
- **UI:** Eval and enrichment results panels now show a loading spinner immediately when no initial result is available, instead of briefly showing an empty state

## 0.5.3

### UI Fixes & Improvements

- **UI:** Eval results panel now defaults to collapsed (minimized) state
- **UI:** Eval duration and cache status are now shown in the header bar alongside pass/fail counts, visible even when collapsed

### Per-Item Caching for Evals and Enrichments

- **Performance:** Evals and enrichments are now cached per item instead of as a single blob per session. Adding a new eval or enrichment only runs the new one — existing unchanged items load from cache instantly.
- Previously, adding a single eval invalidated the entire cache (due to `registeredNames` and `evalsModuleHash` checks), forcing all evals to re-run. Now each item is cached independently using its function's code hash (`fn.toString()` → SHA-256).
- New cache key format: `<prefix>/<kind>/<project>/<session>/item/<itemName>`
- New cache functions: `getPerItemCache()`, `setPerItemCache()`, `hashItemCode()`
- New types: `ItemCacheMeta`, `ItemCacheEntry`
- Session-level actions (`runEvals`, `runEnrichments`) and subagent-level actions (`runSubagentEvals`, `runSubagentEnrichments`) all use per-item caching
- Existing `getCachedResult` / `setCachedResult` retained for backward compatibility (used by dashboard filters)

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
