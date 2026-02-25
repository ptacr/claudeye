/**
 * Example: Alerts
 *
 * Demonstrates app.alert() callbacks that fire after all evals and
 * enrichments complete for a session. Alerts receive the complete
 * eval and enrichment summaries so the callback can decide whether
 * and how to notify.
 *
 * Run with:
 *
 *   claudeye --evals ./examples/alerts.js
 *
 * Open a session page and check the server console for alert output.
 * To test with background processing:
 *
 *   claudeye --evals ./examples/alerts.js --queue-interval 30
 */
import { createApp } from 'claudeye';

const app = createApp();

// ── Evals ────────────────────────────────────────────────────────

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

// ── Enrichments ──────────────────────────────────────────────────

app.enrich('overview', ({ stats }) => ({
  'Turns': stats.turnCount,
  'Tool Calls': stats.toolCallCount,
  'Models': stats.models.join(', ') || 'none',
}));

// ── Alerts ───────────────────────────────────────────────────────

// Console log: always fires, logs a summary line
app.alert('log-results', ({ projectName, sessionId, evalSummary, enrichSummary }) => {
  const evals = evalSummary
    ? `${evalSummary.passCount} pass, ${evalSummary.failCount} fail, ${evalSummary.errorCount} error`
    : 'no evals';
  const enrichments = enrichSummary
    ? `${enrichSummary.results.length} enrichments`
    : 'no enrichments';
  console.log(`[ALERT] ${projectName}/${sessionId}: ${evals} | ${enrichments}`);
});

// Failure alert: only logs when evals fail
app.alert('warn-on-failure', ({ projectName, sessionId, evalSummary }) => {
  if (evalSummary && evalSummary.failCount > 0) {
    const failedNames = evalSummary.results
      .filter(r => !r.error && !r.skipped && !r.pass)
      .map(r => r.name);
    console.warn(
      `[FAILURE] ${projectName}/${sessionId}: ${failedNames.join(', ')} failed`
    );
  }
});

// Slack webhook: uncomment and replace the URL to enable
// app.alert('slack-on-failure', async ({ projectName, sessionId, evalSummary }) => {
//   if (evalSummary && evalSummary.failCount > 0) {
//     await fetch('https://hooks.slack.com/services/T.../B.../xxx', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         text: `${evalSummary.failCount} evals failed for ${projectName}/${sessionId}`,
//       }),
//     });
//   }
// });

app.listen();
