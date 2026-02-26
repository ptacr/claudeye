/**
 * Example: Actions
 *
 * Demonstrates app.action() — on-demand tasks triggered manually from the
 * dashboard. Actions receive the full session context plus cached eval and
 * enrichment results, so they can build on prior analysis.
 *
 * Run with:
 *
 *   claudeye --evals ./examples/actions.js
 *
 * Open a session page, expand the Actions panel, and click Run.
 */
import { createApp } from 'claudeye';

const app = createApp();

// ── Evals (actions can read these results) ──────────────────────

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

// ── Enrichments (actions can read these results too) ────────────

app.enrich('overview', ({ stats }) => ({
  'Turns': stats.turnCount,
  'Tool Calls': stats.toolCallCount,
  'Models': stats.models.join(', ') || 'none',
}));

// ── Actions ─────────────────────────────────────────────────────

// Session summary: combines stats with eval pass counts
app.action('session-summary', ({ stats, evalResults }) => {
  const evalNames = Object.keys(evalResults);
  const passCount = evalNames.filter(n => evalResults[n]?.pass).length;
  return {
    output: [
      `Session: ${stats.turnCount} turns, ${stats.toolCallCount} tool calls`,
      `Duration: ${stats.duration}`,
      `Models: ${stats.models.join(', ') || 'unknown'}`,
      `Evals: ${passCount}/${evalNames.length} passed`,
    ].join('\n'),
    data: {
      turns: stats.turnCount,
      toolCalls: stats.toolCallCount,
      evalsPassed: passCount,
      evalsTotal: evalNames.length,
    },
    status: 'success',
    message: 'Summary generated',
  };
});

// Export metrics: gathers enrichment data into a flat structure
app.action('export-metrics', ({ stats, enrichmentResults }) => {
  const enrichData = {};
  for (const [name, result] of Object.entries(enrichmentResults)) {
    if (result.data) Object.assign(enrichData, result.data);
  }
  return {
    data: {
      ...enrichData,
      turnCount: stats.turnCount,
      toolCallCount: stats.toolCallCount,
    },
    status: 'success',
    message: `Exported ${Object.keys(enrichData).length + 2} metrics`,
  };
});

// Tool inventory: lists unique tools used in the session
app.action('tool-inventory', ({ entries }) => {
  const toolUses = entries.filter(e =>
    e.type === 'assistant' &&
    Array.isArray(e.message?.content) &&
    e.message.content.some(b => b.type === 'tool_use')
  );
  const toolNames = [...new Set(toolUses.flatMap(e =>
    (e.message?.content || []).filter(b => b.type === 'tool_use').map(b => b.name)
  ))];
  return {
    output: toolNames.length > 0
      ? `Tools used:\n${toolNames.map(t => `  - ${t}`).join('\n')}`
      : 'No tools used in this session',
    data: { uniqueTools: toolNames.length, totalCalls: toolUses.length },
    status: 'success',
  };
}, { condition: ({ stats }) => stats.toolCallCount > 0 });

// Side-effect action: always re-runs (cache: false)
// Uncomment to write session reports to a file:
// app.action('write-report', async ({ projectName, sessionId, stats }) => {
//   const fs = await import('fs/promises');
//   await fs.appendFile('session-reports.jsonl', JSON.stringify({
//     projectName, sessionId, turns: stats.turnCount,
//     timestamp: new Date().toISOString(),
//   }) + '\n');
//   return { status: 'success', message: 'Report appended' };
// }, { cache: false });

app.listen();
