# Changelog

## 0.3.3 - First Public Release

### Dashboard

- **Projects & sessions browser** with keyword search, date range presets (Last Hour, Today, 7 Days, 30 Days), custom date picker, and pagination (25 per page)
- **Full execution trace viewer** showing every message, tool call, thinking block, and system event
- **Virtual scrolling** for sessions with thousands of entries
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
