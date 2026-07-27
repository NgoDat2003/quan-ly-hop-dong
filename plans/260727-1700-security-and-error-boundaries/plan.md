---
title: "Security Headers, Rate Limiting, and FE Error Boundaries"
description: "Add @nestjs/throttler + helmet to apps/api, and root-level error/not-found/global-error/loading boundaries to apps/web — four framework-agnostic hardening gaps surfaced by scouting the codebase against the generic backend-development/frontend-development skill checklists (filtered to items that actually apply to this NestJS+Prisma / Next.js+shadcn stack)."
status: completed
priority: P2
effort: "1.5h"
branch: "main"
tags: [base-template, hardening, security, frontend]
blockedBy: []
blocks: []
created: "2026-07-27T08:30:13.909Z"
createdBy: "ck:plan"
source: skill
---

# Security Headers, Rate Limiting, and FE Error Boundaries

## Overview

`training-app` is a base template cloned as the starting point for future projects (same framing as `../260727-1500-base-template-hardening/`). A scout pass against the generic `backend-development`/`frontend-development` skill checklists — filtered to drop stack-specific mismatches (those skills assume MUI/TanStack Router for FE and a generic multi-language BE, neither of which apply here) — found four real, verified gaps:

1. BE has no rate limiting (`@nestjs/throttler` absent from `apps/api/package.json`).
2. BE has no security headers middleware (`helmet` absent).
3. FE has no Next.js App Router error boundaries (`error.tsx`, `not-found.tsx`, `global-error.tsx` all absent) — an unhandled runtime error currently white-screens with no fallback UI.
4. FE has no `loading.tsx` — no route-level Suspense fallback exists anywhere.

All four are "free win" infra additions, not architectural decisions or new product functionality — same category as the health-check/env-validation items already done in `../260727-1500-base-template-hardening/`. See `brainstorm-summary-security-and-error-boundaries.md` in that directory for the full comparison and the decisions below.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Backend Security Hardening](./phase-01-backend-security-hardening.md) | Completed |
| 2 | [Frontend Error and Loading Boundaries](./phase-02-frontend-error-and-loading-boundaries.md) | Completed |

Effort: 1h + 30m ≈ **1.5h**.

## Dependency Graph

Both phases are mutually independent — no file overlap (Phase 1 touches only `apps/api/*`; Phase 2 touches only `apps/web/app/*`). Can be done in either order or in parallel.

```
P1 (backend security hardening)             — independent
P2 (frontend error/loading boundaries)      — independent
```

## Key decisions (from brainstorm)

- **Helmet + Swagger conflict:** Swagger UI is mounted at `/api` (`apps/api/src/main.ts`). Helmet's default CSP blocks its inline scripts/styles. Fix: `helmet({ contentSecurityPolicy: false })` — matches NestJS's own documented Swagger-compatibility recommendation, keeps all other helmet headers (HSTS, X-Frame-Options, etc.) active.
- **Rate limit threshold:** flat 100 req/min/IP via a global `ThrottlerGuard`. No per-route tightening (e.g., a stricter `/auth/login` limit) — the base template has no real domain module yet; a cloned project tightens specific routes once it has real endpoints to reason about.
- **FE boundary scope:** root-level only (`app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx`, `app/loading.tsx`). No per-route-group boundaries — there is no `(app)/` route group yet (only `(auth)/login`), so a group-specific boundary would be a dead file until that group exists. Next.js inherits the nearest boundary down the route tree automatically.
- **FE boundary UI:** reuse existing shadcn primitives (`Card`, `Button` — already used in `login-form.tsx`), not plain text and not a new illustration system.

## Explicitly Out of Scope

- Per-route rate-limit tightening (e.g., stricter login throttle) — no real attack surface yet to justify tuning beyond the flat default.
- Per-route-group FE error/loading boundaries — no second route group exists yet.
- CI/CD or automated security scanning — separate concern, not raised in this pass.

## Success Criteria (plan-level)

1. [x] `pnpm build && pnpm lint && pnpm check-types && pnpm test` all exit 0 from repo root after both phases.
2. [x] `GET /api` (Swagger UI) still renders correctly with helmet active.
3. [x] Repeated rapid requests to any API endpoint return `429` after the threshold.
4. [x] Throwing an error inside any FE route renders the shadcn-styled error UI instead of a blank/white screen (verified via a temporary throw, removed after verification).

## Completion Summary

Both phases implemented, manually verified, and independently code-reviewed (0 critical findings; 1 high-priority finding in Phase 1 — an over-confident code comment about NestJS guard ordering — fixed same session). Full verification log in each phase file.

**Unplanned discovery:** `pnpm --filter=web build` initially failed with `EPERM: symlink` on Windows — caused by a pre-existing, unrelated `output: 'standalone'` setting in `next.config.ts` (added in an earlier session for Docker support), not by this plan's changes. Resolved by the user enabling Windows Developer Mode. Documented in Phase 2's verification log since it blocked confirming that phase's own build success criterion.

## Research Context

- [Brainstorm summary](../260727-1500-base-template-hardening/brainstorm-summary-security-and-error-boundaries.md) — full checklist comparison, options considered, and decision rationale.
- Prior hardening plan: `../260727-1500-base-template-hardening/plan.md` (completed, 4/4 phases) — same "free win, not new feature" framing.
