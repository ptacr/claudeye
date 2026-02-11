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
