# AI Meeting Copilot

Meeting intelligence workspace for turning conversations into searchable knowledge and accountable follow-through.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Web preview is served by `artifacts/ai-meeting-copilot: web`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Wouter + TanStack Query + Tailwind CSS

## Where things live

- `artifacts/ai-meeting-copilot/src/App.tsx` — app shell, routes, and product UI
- `artifacts/ai-meeting-copilot/src/index.css` — workspace visual tokens
- `artifacts/api-server/src/routes/` — API handlers
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/meetings.ts` — meeting intelligence tables

## Architecture decisions

- Demo processing is database-backed and deterministic so the complete workflow works without paid AI APIs.
- Frontend data access uses generated OpenAPI hooks instead of hand-written request types.
- Calendar dates are normalized at the API boundary because the create form submits a local date-time.

## Product

Users can capture meetings, browse transcript-backed records, review decisions, manage follow-through, search meeting knowledge, and ask grounded questions with sources.

## User preferences

The product should remain professional, focused, responsive, and free of unnecessary animation or visual noise.

## Gotchas

- Run OpenAPI codegen after changing `lib/api-spec/openapi.yaml`.
- Artifact builds require workflow-provided `PORT` and `BASE_PATH` values when run from the shell.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
