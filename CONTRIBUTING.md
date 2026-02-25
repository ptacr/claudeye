# Contributing to Claudeye

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- Bun >= 1.3.0 (or Node.js >= 20.9.0)

## Development Setup

```bash
git clone https://github.com/exosphereHost/claudeye.git
cd claudeye
bun install
bun run dev
```

The dev server starts at `http://localhost:8020`.

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start the development server |
| `bun run lint` | Run ESLint |
| `bunx tsc --noEmit` | Type-check without emitting |
| `bun run test:run` | Run tests once (Vitest) |
| `bun run test` | Run tests in watch mode |
| `bun run build` | Production build (Next.js) |

## Project Structure

```
claudeye/
├── app/            # Next.js app router (pages, layouts, server actions)
├── bin/            # CLI entry point
├── components/     # Shared React components
├── contexts/       # React context providers
├── lib/            # Core logic (parsing, evals, queue, server utilities)
├── scripts/        # Dev/start/build helper scripts
├── __tests__/      # Test files
├── docs/           # API reference documentation
├── examples/       # Example evals/enrichments/alerts files
└── public/         # Static assets
```

### Key Subsystems

| Directory | Description |
|-----------|-------------|
| `lib/evals/` | Eval, enrichment, alert, and dashboard registries + runners |
| `lib/eval-queue.ts` | Unified priority queue for all eval/enrichment processing |
| `lib/cache/` | Per-item caching with content-hash invalidation |
| `app/actions/` | Next.js server actions (queue helpers, status, workers) |
| `app/components/` | UI panels (eval results, enrichment results, queue status) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_PROJECTS_PATH` | Path to Claude projects directory |
| `CLAUDEYE_EVALS_MODULE` | Path to evals file (set by `--evals`) |
| `CLAUDEYE_CACHE` | `off` to disable caching |
| `CLAUDEYE_CACHE_PATH` | Custom cache directory |
| `CLAUDEYE_QUEUE_INTERVAL` | Background queue scan interval in seconds |
| `CLAUDEYE_QUEUE_CONCURRENCY` | Max parallel items (default: 2) |
| `CLAUDEYE_QUEUE_HISTORY_TTL` | Seconds to keep completed items in history (default: 3600) |
| `CLAUDEYE_QUEUE_MAX_SESSIONS` | Max sessions to process per scan (default: 8, 0=unlimited) |
| `CLAUDEYE_AUTH_USERS` | Comma-separated `user:pass` pairs |
| `CLAUDEYE_AUTH_SECRET` | HMAC secret for session cookies (auto-generated if not set) |

## Pull Request Guidelines

1. Keep changes focused — one concern per PR.
2. Make sure all checks pass before requesting review:
   ```bash
   bun run lint && bunx tsc --noEmit && bun run test:run && bun run build
   ```
3. Include a clear description of what the PR does and why.
4. Add tests for new functionality when applicable.

## Reporting Issues

Found a bug or have a feature idea? [Open an issue](https://github.com/exosphereHost/claudeye/issues). The issue templates will guide you through providing the right details.
