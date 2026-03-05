# Contributing

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.3+
- [PostgreSQL](https://www.postgresql.org/) 15+ (or use Docker)
- [Node.js](https://nodejs.org/) 20+

### Getting Started

```bash
git clone https://github.com/jurczykpawel/reelstack.git
cd reelstack
bun install
cp .env.example .env
```

Edit `.env` with `AUTH_SECRET` and `DATABASE_URL`, then:

```bash
# Set up database
cd packages/database
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma db push
cd ../..

# Start dev server
bun run dev
```

## Project Structure

- `apps/web` — Next.js frontend and API
- `packages/types` — Shared TypeScript interfaces
- `packages/core` — Engines (subtitle, template, render, playback), action system, serializer
- `packages/ffmpeg` — SRT/ASS parsing and generation
- `packages/database` — Prisma ORM and query helpers
- `packages/queue` — Queue adapters (Inngest, BullMQ)
- `packages/storage` — Storage adapters (Supabase, MinIO)
- `packages/transcription` — Audio extraction, Whisper transcription, word grouping

## State Management

The app uses a layered architecture:

1. **Engines** (`packages/core`) — Pure functions: accept state, return new state. No side effects.
2. **Stores** (`apps/web/src/store/`) — Zustand stores hold runtime state (project, engine, timeline, UI).
3. **Bridges** (`apps/web/src/lib/bridges/`) — React hooks that combine stores + engines into component-facing APIs.
4. **Components** — React components consume bridges, never stores directly.

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run build` | Production build |
| `bun run test` | Run all tests (414 tests) |
| `bun run lint` | Lint all packages |
| `bun run format` | Format with Prettier |
| `bun run format:check` | Check formatting |

## Code Style

- TypeScript strict mode
- Prettier: single quotes, semicolons, 100 char width
- ESLint with Next.js recommended rules

## Testing

Tests use Vitest for unit tests and Playwright for E2E.

```bash
# Run all tests
bun run test

# Run specific package tests
cd apps/web && npx vitest run
cd packages/core && npx vitest run
cd packages/ffmpeg && npx vitest run
cd packages/database && npx vitest run
cd packages/transcription && npx vitest run

# Run with watch mode
cd apps/web && npx vitest
```

When adding new features:
- Add unit tests for API routes (mock auth + database)
- Add unit tests for utility functions and engines
- Add E2E tests for critical user flows

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add subtitle export dialog
fix: correct timeline zoom calculation
docs: update deployment guide
test: add store unit tests
```

## Pull Request Process

1. Fork the repo and create a feature branch.
2. Write tests for new functionality.
3. Ensure `bun run test` and `bun run build` pass.
4. Open a PR with a clear description of changes.

## Architecture Notes

- **Auth**: Auth.js (NextAuth v5) with Prisma adapter. Config in `apps/web/src/lib/auth.ts`.
- **API routes**: All protected routes use `getAuthUser()` from `lib/api/auth.ts`. All DB queries filter by userId.
- **API v1**: Public API with API key auth. Routes in `apps/web/src/app/api/v1/`.
- **Adapter pattern**: Queue and storage auto-detect cloud vs VPS mode from env vars.
- **State management**: Zustand stores → bridges → components. See `apps/web/src/store/` and `apps/web/src/lib/bridges/`.
- **Core engines**: Pure functions in `packages/core/src/engines/`. No side effects, easy to test.
- **Client rendering**: FFmpeg.wasm in `apps/web/src/lib/ffmpeg/client-renderer.ts`.
- **Server rendering**: Worker in `apps/web/src/lib/worker/render-worker.ts`.
