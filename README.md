# Training App — Base Skeleton

> **⚠️ This is a structural skeleton. Do not deploy this anywhere.**
> Every service method, both auth guards (`JwtAuthGuard`, `PermissionsGuard`), `JwtStrategy.validate()`, and the frontend action hook (`useAuthActions().login`) are stubs. The API has **no real authentication and no real authorization** — both guards currently `return true` unconditionally.

## What this base contains

- A monorepo (Turborepo + pnpm) with `apps/api` (NestJS + Prisma + PostgreSQL) and `apps/web` (Next.js App Router + shadcn/ui).
- One domain table: `User` (+ `Role` enum). **There is no other domain module.** Adding the first one is the reader's job — see [`apps/api/src/modules/README.md`](./apps/api/src/modules/README.md).
- A stubbed JWT/access-control layer: guards, decorators, and a `JwtStrategy` are wired but no-op.
- An envelope-typed contract pipeline: backend DTOs → OpenAPI → Orval → typed frontend hooks.
- A single screen: `/login`. No dashboard, no register page, no other route.

## Prerequisites

- Node >= 18
- pnpm
- **Docker** (for local Postgres)

## Setup

```bash
pnpm install
cp .env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
docker compose up -d
pnpm --filter=api prisma:migrate
pnpm codegen
pnpm dev
```

- API: `http://localhost:3001` — Swagger UI at `http://localhost:3001/api`
- Web: `http://localhost:3000` — the only screen is `http://localhost:3000/login`

## What is stubbed (read this before filing a bug)

| Piece                                              | Current behavior                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `UsersService.findById` / `findByEmail` / `create` | Return `null` / throw `not implemented`                            |
| `AuthService.login` / `me`                         | Return a hardcoded stub user + `'stub-token'`                      |
| `JwtAuthGuard.canActivate`                         | `return true` — **every route is open**                            |
| `PermissionsGuard.canActivate`                     | `return true` — **no permission is ever enforced**                 |
| `JwtStrategy.validate()`                           | Returns a hardcoded user, never looks one up                       |
| `hasPermission()`                                  | `return true` unconditionally                                      |
| `useAuthActions().login` (frontend)                | Calls the real `POST /auth/login` endpoint and discards the result |

**Logging in on `/login` appears to succeed and does nothing.** The request really hits the backend and gets a 200, but no token is stored, no redirect happens, and no toast appears. That is the intended state of this base, not a bug.

## The one architectural decision worth carrying forward

Every successful response is enveloped as `{ statusCode, data }` by `TransformInterceptor`, documented via concrete per-endpoint DTO subclasses of `ApiResponseDto` (not the generic `allOf` pattern — see `apps/api/src/modules/README.md` for why, and when to switch). The frontend's fetch mutator (`apps/web/lib/api/http-client.ts`) does **not** unwrap this envelope.

One nuance specific to this base's Orval version: the generated react-query hooks wrap every response as `{ data, status, headers }` on top of that envelope, so a call site reads `res.data.data` — the outer `data` is Orval's fetch-client wrapper, the inner `data` is the API's own envelope. This is called out inline in `use-auth-actions.ts`.

## Two rules for every future change

1. **Never hand-edit `apps/web/lib/api/generated/`.** Change the backend DTO/Swagger, then run `pnpm codegen` from the repo root.
2. **Adding a backend module** follows [`apps/api/src/modules/README.md`](./apps/api/src/modules/README.md) — there is no scaffolded example to copy, only the live `auth`/`users` modules and that doc.

## Docker images

`apps/api/Dockerfile` and `apps/web/Dockerfile` are multi-stage builds (pnpm workspace-aware, non-root runtime user) that produce a runnable image for each app:

```bash
docker build -f apps/api/Dockerfile -t training-app-api .
docker build -f apps/web/Dockerfile -t training-app-web --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 .
```

**Written but not build/run-tested on a real machine yet** — verify both before relying on them for anything real. They intentionally stop at "produces a runnable image." Neither is wired to a deploy platform (Dokploy, Vercel, K8s, a plain VPS, whatever) — picking and configuring that is the concrete project's job once it knows its actual target, not this base's. `docker-compose.yml` here stays local-dev-only (Postgres only); there is no `docker-compose.prod.yml` and no CI/CD.

## Common commands

```bash
pnpm dev            # both apps, watch mode
pnpm build          # both apps
pnpm lint            # both apps
pnpm check-types    # both apps
pnpm test           # both apps — two harness-proof specs total, not behavior tests
pnpm codegen        # api openapi export -> orval -> typed web client
```
