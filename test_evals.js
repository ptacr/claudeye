import { createApp } from 'claudeye';

const app = createApp();

app.eval('no-errors', ({ entries }) => {
  const errors = entries.filter(e =>
    e.type === 'assistant' &&
    Array.isArray(e.message?.content) &&
    e.message.content.some(b => b.type === 'tool_use' && b.result?.content?.includes('Error'))
  );
  return {
    pass: errors.length === 0,
    score: 1 - Math.min(errors.length / 10, 1),
    message: errors.length === 0 ? 'No tool errors' : `${errors.length} tool error(s)`,
  };
});

app.eval('has-completion', ({ entries }) => {
  const lastAssistant = [...entries].reverse().find(e => e.type === 'assistant');
  const hasText = lastAssistant?.message?.content?.some(b => b.type === 'text');
  return {
    pass: !!hasText,
    score: hasText ? 1.0 : 0,
    message: hasText ? 'Session ended with a text response' : 'No final text response',
  };
});

app.eval('under-50-turns', ({ stats }) => {
  return {
    pass: stats.turnCount <= 50,
    score: Math.max(0, 1 - stats.turnCount / 100),
    message: `${stats.turnCount} turn(s)`,
  };
});

// --- Actions ---

app.action('session-summary', ({ entries, stats, evalResults }) => {
  const evalNames = Object.keys(evalResults);
  const passCount = evalNames.filter(n => evalResults[n]?.pass).length;
  const lines = [
    `Session: ${stats.turnCount} turns, ${stats.toolCallCount} tool calls`,
    `Duration: ${stats.duration}`,
    `Models: ${stats.models.join(', ') || 'unknown'}`,
    `Evals: ${passCount}/${evalNames.length} passed`,
  ];
  return {
    output: lines.join('\n'),
    data: { turns: stats.turnCount, toolCalls: stats.toolCallCount, evalsPassed: passCount },
    status: 'success',
    message: 'Summary generated',
  };
});

app.action('export-metrics', ({ stats, enrichmentResults }) => {
  const enrichData = {};
  for (const [name, result] of Object.entries(enrichmentResults)) {
    if (result.data) Object.assign(enrichData, result.data);
  }
  return {
    data: { ...enrichData, turnCount: stats.turnCount, toolCallCount: stats.toolCallCount },
    status: 'success',
    message: `Exported ${Object.keys(enrichData).length + 2} metrics`,
  };
});

// --- Dashboard view with aggregates ---

app.dashboard.view('overview', { label: 'Session Overview' })
  .aggregate('session-metrics', {
    collect: ({ stats, evalResults }) => ({
      turnCount: stats.turnCount,
      toolCalls: stats.toolCallCount,
      hasCompletion: evalResults['has-completion']?.pass ?? false,
      primaryModel: stats.models[0] || 'unknown',
    }),
    reduce: (collected) => {
      const models = new Map();
      let totalTurns = 0;
      let totalTools = 0;
      let completions = 0;
      for (const s of collected) {
        totalTurns += typeof s.values.turnCount === 'number' ? s.values.turnCount : 0;
        totalTools += typeof s.values.toolCalls === 'number' ? s.values.toolCalls : 0;
        if (s.values.hasCompletion === true) completions++;
        const model = s.values.primaryModel;
        if (typeof model === 'string') models.set(model, (models.get(model) || 0) + 1);
      }
      const n = collected.length || 1;
      return [
        { Metric: 'Avg Turns', Value: +(totalTurns / n).toFixed(1) },
        { Metric: 'Avg Tool Calls', Value: +(totalTools / n).toFixed(1) },
        { Metric: 'Completion Rate', Value: +((completions / n) * 100).toFixed(1) },
        ...Array.from(models.entries()).map(([model, count]) => ({
          Metric: `Model: ${model}`, Value: count,
        })),
      ];
    },
  }, { label: 'Session Metrics' })
  .filter('turns', ({ stats }) => stats.turnCount, { label: 'Turns' });
