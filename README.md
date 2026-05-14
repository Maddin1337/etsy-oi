# Etsy Opportunity Intelligence

Foundation monorepo for the v1 Etsy opportunity analysis product described in `docs/plans`.

## Structure

- `apps/web`: customer-facing web shell
- `apps/api`: REST/JSON v1 API skeleton
- `apps/worker-collector`: capture worker entrypoint
- `apps/worker-parser`: parsing/validation worker entrypoint
- `apps/worker-scoring`: scoring worker entrypoint
- `apps/admin`: internal QA/admin shell
- `packages/shared-types`: versioned DTOs, enums, failures, and Zod contracts
- `packages/db`: Postgres schema, migration SQL, ClickHouse DDL, DB utilities
- `packages/extractors`, `packages/validators`, `packages/scoring`, `packages/telemetry`: domain package placeholders

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm --filter @etsy-oi/api dev
pnpm --filter @etsy-oi/web dev
```

`pnpm install` must be able to reach `https://registry.npmjs.org`. If install fails, the remaining commands will fail with missing local tools such as `turbo`, `vitest`, or `@playwright/test`.

## Local MVP web slice

Start the API and web app in two terminals:

```bash
pnpm --filter @etsy-oi/api dev
pnpm --filter @etsy-oi/web dev
```

Open `http://127.0.0.1:3000`. The Vite dev server proxies `/api/*` to the Fastify API on `http://127.0.0.1:4000`.
The API binds to `127.0.0.1` by default; override with `HOST` only when the runtime permits binding another interface.

The current MVP web slice supports:

- keyword analysis creation, polling, status view, score/result view, and refresh
- listing analysis creation, polling, status view, score/result view, and refresh
- visible UI handling for `queued`, `running`, `partial`, `completed`, `failed`, and `stale`
- deterministic API stub data against the shared v1 contracts

The API serves `/healthz`, `/readyz`, and v1 analysis route stubs. Create requests validate Etsy listing URLs, normalize keyword/listing inputs, and replay duplicate create requests by idempotency key. Refresh requests create a linked replacement analysis and mark the original as refreshed; cancel requests remain terminal on later reads. The implementation is a lightweight Fastify TypeScript skeleton so it can later be wrapped by NestJS without changing shared contracts.

## Verification

Run the hardening loop after dependency installation:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
```

The Playwright suite starts the API and web dev servers from `playwright.config.ts` and covers the keyword and listing MVP flows.
It also covers invalid listing input, refresh navigation, and returning from an analysis detail view to the dashboard.
