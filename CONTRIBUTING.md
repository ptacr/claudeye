# Contributing to Claudeye

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- Node.js >= 18.18.0
- npm

## Development Setup

```bash
git clone https://github.com/exosphereHost/claudeye.git
cd claudeye
npm install
npm run dev
```

The dev server starts at `http://localhost:8020`.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Type-check without emitting |
| `npm run test:run` | Run tests once (Vitest) |
| `npm test` | Run tests in watch mode |
| `npm run build` | Production build (Next.js) |

## Project Structure

```
claudeye/
├── app/            # Next.js app router (pages, layouts, server actions)
├── bin/            # CLI entry point
├── components/     # Shared React components
├── contexts/       # React context providers
├── lib/            # Core logic (parsing, evals, server utilities)
├── scripts/        # Dev/start/build helper scripts
├── __tests__/      # Test files
├── docs/           # API reference documentation
└── public/         # Static assets
```

## Pull Request Guidelines

1. Keep changes focused — one concern per PR.
2. Make sure all checks pass before requesting review:
   ```bash
   npm run lint && npx tsc --noEmit && npm run test:run && npm run build
   ```
3. Include a clear description of what the PR does and why.
4. Add tests for new functionality when applicable.

## Reporting Issues

Found a bug or have a feature idea? [Open an issue](https://github.com/exosphereHost/claudeye/issues). The issue templates will guide you through providing the right details.
