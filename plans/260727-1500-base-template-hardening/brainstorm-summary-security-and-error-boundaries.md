# Brainstorm Summary: Rate Limiting, Security Headers, FE Error/Loading Boundaries

**Date:** 2026-07-27
**Context:** Third brainstorm in the same base-template-hardening line (after `brainstorm-summary.md` BE hardening and `brainstorm-summary-frontend.md` FE clone-readiness). Triggered by scouting the codebase against the generic `backend-development`/`frontend-development` skill checklists — those skills assume a different stack (MUI/TanStack Router/GraphQL for FE, multi-language generic for BE), so only the framework-agnostic checklist items were evaluated against this repo's actual stack (NestJS+Prisma, Next.js App Router+shadcn). Stack-specific mismatches (MUI, TanStack Router, GraphQL, MongoDB) were discarded as not applicable.

## Problem statement

Four real gaps surfaced from the filtered checklist comparison, verified by direct grep/find (not assumed):
1. BE has no rate limiting (`@nestjs/throttler` absent from `apps/api/package.json`).
2. BE has no security headers middleware (`helmet` absent).
3. FE has no Next.js App Router error boundaries (`error.tsx`, `not-found.tsx`, `global-error.tsx` all absent from `apps/web/app/`) — an unhandled runtime error currently white-screens with no fallback UI.
4. FE has no `loading.tsx` — no route-level Suspense fallback exists anywhere.

Everything else checked (env validation, health checks, exception filter, TS strict mode, feature folder organization) was already present from prior hardening passes or the original scaffold.

## Requirements (đã chốt qua AskUserQuestion)

- **Scope:** all 4 items, in this base template (not deferred to per-project setup — these are "free wins," not architectural decisions, per the same reasoning already applied to health checks/env validation in `brainstorm-summary.md`).
- **Helmet + Swagger conflict:** Swagger UI is mounted at `/api` in `apps/api/src/main.ts:31` via `SwaggerModule.setup()`. Helmet's default CSP blocks Swagger UI's inline scripts/styles. Decision: disable CSP entirely (`helmet({ contentSecurityPolicy: false })`) — matches NestJS's own documented recommendation for Swagger compatibility, keeps helmet's other headers (HSTS, X-Frame-Options, etc.) intact.
- **Rate limit threshold:** flat 100 req/min/IP via `@nestjs/throttler` global guard — no per-route tightening (e.g., stricter `/auth/login` limit) in this pass. Base template has no real domain module yet; a project cloning this can tighten specific routes once it has real endpoints to reason about.
- **FE boundary scope:** root-level only — `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx`, `app/loading.tsx`. No per-route-group boundaries (there is no `(app)/` route group yet — only `(auth)/login` — so a route-group-specific boundary would be a dead file until that group exists). Next.js App Router boundaries are inherited down the route tree automatically, so root-level covers everything present and future until a route opts into its own.
- **FE boundary UI:** use existing shadcn primitives (`Card`, `Button` — already used in `login-form.tsx`) for consistency with the one real screen that exists. Not plain unstyled text, not a new illustration/animation system.

## Touchpoints

- BE: `apps/api/package.json` (add `@nestjs/throttler`, `helmet`), `apps/api/src/main.ts` (wire helmet + Swagger CSP exception), `apps/api/src/app.module.ts` (register `ThrottlerModule` + global `ThrottlerGuard`)
- FE: `apps/web/app/error.tsx`, `apps/web/app/not-found.tsx`, `apps/web/app/global-error.tsx`, `apps/web/app/loading.tsx` (new files)

## Explicitly out of scope

- Per-route rate-limit tightening (e.g., stricter login throttle) — no real attack surface yet to justify tuning beyond a flat default.
- Per-route-group FE error/loading boundaries — no second route group exists yet.
- Any CI/CD or automated security scanning — separate concern, not raised in this pass.

## Unresolved questions

- None — both AskUserQuestion rounds converged with the recommended option each time.
