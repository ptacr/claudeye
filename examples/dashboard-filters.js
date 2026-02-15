/**
 * Example: Dashboard Views with Filters
 *
 * Demonstrates named dashboard views with focused filter sets, plus
 * evals and enrichments. Run with:
 *
 *   claudeye --evals ./examples/dashboard-filters.js
 *
 * Then navigate to /dashboard to see the view index, and click a view
 * to see its filter tiles in action.
 */
import { createApp } from 'claudeye';

const app = createApp();

// ── Global condition ─────────────────────────────────────────────
// Skip empty sessions across evals, enrichments, AND dashboard filters.
app.condition(({ entries }) => entries.length > 0);

// ── Performance view ─────────────────────────────────────────────
app.dashboard.view('performance', { label: 'Performance Metrics' })
  .filter('turn-count', ({ stats }) => stats.turnCount, { label: 'Turn Count' })
  .filter('tool-calls', ({ stats }) => stats.toolCallCount, { label: 'Tool Calls' })
  .filter('avg-tools-per-turn',
    ({ stats }) => stats.turnCount > 0
      ? Math.round(stats.toolCallCount / stats.turnCount * 10) / 10
      : 0,
    {
      label: 'Avg Tools/Turn',
      condition: ({ stats }) => stats.toolCallCount > 0,
    }
  );

// ── Quality view ─────────────────────────────────────────────────
app.dashboard.view('quality', { label: 'Quality Checks' })
  .filter('has-errors', ({ entries }) =>
    entries.some(e =>
      e.type === 'assistant' &&
      Array.isArray(e.message?.content) &&
      e.message.content.some(b => b.type === 'tool_use' && b.is_error)
    ),
    { label: 'Has Errors' }
  )
  .filter('primary-model', ({ stats }) => stats.models[0] || 'unknown',
    { label: 'Primary Model' }
  )
  .filter('uses-subagents', ({ stats }) => stats.subagentCount > 0,
    { label: 'Uses Subagents' }
  );

// ── Session-level evals ──────────────────────────────────────────

app.eval('under-50-turns', ({ stats }) => ({
  pass: stats.turnCount <= 50,
  score: Math.max(0, 1 - stats.turnCount / 100),
  message: `${stats.turnCount} turn(s)`,
}));

app.eval('has-completion', ({ entries }) => {
  const last = [...entries].reverse().find(e => e.type === 'assistant');
  const hasText = last?.message?.content?.some?.(b => b.type === 'text');
  return {
    pass: !!hasText,
    score: hasText ? 1.0 : 0,
    message: hasText ? 'Ended with text' : 'No final text response',
  };
});

// Filter to session-only entries when needed
app.eval('session-tool-count', ({ entries }) => {
  const sessionTools = entries
    .filter(e => e._source === 'session' && e.type === 'assistant')
    .flatMap(e => (e.message?.content || []).filter(b => b.type === 'tool_use'));
  return {
    pass: sessionTools.length <= 100,
    score: Math.max(0, 1 - sessionTools.length / 200),
    message: `${sessionTools.length} session-level tool calls`,
  };
});

// ── Session-level enrichments ────────────────────────────────────

app.enrich('session-overview', ({ stats }) => ({
  'Turns': stats.turnCount,
  'Tool Calls': stats.toolCallCount,
  'Subagents': stats.subagentCount,
  'Duration': stats.duration,
  'Models': stats.models.join(', ') || 'none',
}));
