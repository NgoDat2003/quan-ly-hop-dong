---
phase: 1
title: "Backend Security Hardening"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Backend Security Hardening

## Overview

Add rate limiting (`@nestjs/throttler`) and security headers (`helmet`) to `apps/api` — both currently absent. Neither requires a real domain module to be useful; they protect the app-level surface (auth endpoints, health check, Swagger) that already exists.

## Requirements

- Functional: every HTTP request is rate-limited at 100 req/min/IP; every HTTP response carries helmet's standard security headers.
- Non-functional: Swagger UI at `/api` must keep rendering correctly (helmet's default CSP would break it — must be disabled).

## Architecture

- `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])` registered in `AppModule`, paired with `APP_GUARD` provider for `ThrottlerGuard` so every route is covered without per-controller `@UseGuards()` (same pattern already used for `JwtAuthGuard`/`PermissionsGuard` via `AccessControlModule`).
- `helmet({ contentSecurityPolicy: false })` applied as Express middleware in `main.ts`, before `SwaggerModule.setup()`.

## Related Code Files

- Modify: `apps/api/package.json` (add `@nestjs/throttler`, `helmet` dependencies)
- Modify: `apps/api/src/app.module.ts` (register `ThrottlerModule` + global `ThrottlerGuard` via `APP_GUARD`)
- Modify: `apps/api/src/main.ts` (apply `helmet()` middleware before Swagger setup)

## Implementation Steps

1. `pnpm --filter=api add @nestjs/throttler helmet`
2. In `apps/api/src/app.module.ts`:
   - Import `ThrottlerModule` and `ThrottlerGuard` from `@nestjs/throttler`, `APP_GUARD` from `@nestjs/core`.
   - Add `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])` to the `imports` array.
   - Add `{ provide: APP_GUARD, useClass: ThrottlerGuard }` to the `providers` array.
3. In `apps/api/src/main.ts`:
   - Import `helmet` (default import, `import helmet from 'helmet'`).
   - Call `app.use(helmet({ contentSecurityPolicy: false }));` — place it right after `NestFactory.create(AppModule)`, before the `ValidationPipe`/interceptor/filter setup (order doesn't strictly matter for these, but keep it near the top for readability as "first thing applied to every response").
   - Do NOT touch the existing `SwaggerModule.setup()` call or `DocumentBuilder` config — CSP is fully disabled, no per-route exception needed.
4. Run `pnpm --filter=api build && pnpm --filter=api lint && pnpm --filter=api check-types`.
5. Manual verification (dev server): start `pnpm dev`, confirm `GET http://localhost:3001/api` (Swagger UI) still renders with no console CSP errors; confirm response headers include `Strict-Transport-Security`, `X-Content-Type-Options`, etc. (any endpoint); fire >100 requests within 60s at any endpoint (e.g., a quick loop against `/health`) and confirm the 101st returns `429`.

## Success Criteria

- [x] `@nestjs/throttler` and `helmet` present in `apps/api/package.json` dependencies (not devDependencies).
- [x] `ThrottlerGuard` registered as a global guard via `APP_GUARD` — no controller needs its own `@UseGuards(ThrottlerGuard)`.
- [x] `helmet({ contentSecurityPolicy: false })` applied in `main.ts` before any route handling.
- [x] Swagger UI at `/api` renders with no CSP console errors.
- [x] Rapid repeated requests to any endpoint return `429 Too Many Requests` after 100 requests within 60 seconds.
- [x] `pnpm build && pnpm lint && pnpm check-types && pnpm test` exit 0 from repo root.

## Risk Assessment

- **Risk:** Enabling helmet's default CSP would silently break Swagger UI (blank page, console errors about blocked inline scripts). **Mitigation:** CSP explicitly disabled per the brainstorm decision — verified by loading `/api` after the change, not assumed.
- **Risk:** A flat 100 req/min/IP limit could be too strict or too loose once real domain endpoints exist. **Mitigation:** explicitly out of scope for this pass (see `plan.md`) — a cloned project tightens specific routes (e.g., login) once it has real traffic patterns to reason about. Not a regression risk for this base template today, since the only real endpoints are `auth`, `users`, `health`.
- **Risk:** `ThrottlerGuard` as a global guard could interact unexpectedly with the existing global `JwtAuthGuard`/`PermissionsGuard` from `AccessControlModule` (guard execution order). **Mitigation:** register `ThrottlerModule` before `AccessControlModule` in the `imports` array. **Post-implementation correction (from code review):** the in-code comment originally asserted NestJS "executes global guards in registration order" as a documented fact — this is NOT actually guaranteed for `APP_GUARD` providers spread across different modules (only same-array `@UseGuards(A, B, C)` has a documented order; see nestjs/nest#5598, nestjs/docs.nestjs.com#1567). Comment reworded in `app.module.ts` to state this is an assumption to re-verify empirically once `JwtAuthGuard`/`PermissionsGuard` hold real logic — zero impact today since both guards currently stub `return true`.

## Verification Log

- `pnpm --filter=api build/lint/check-types` — all pass.
- `pnpm test` (root, both apps) — 2/2 suites pass.
- Manual: started `pnpm dev`, confirmed `GET http://localhost:3001/api` → 200, headers include `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` (no `Content-Security-Policy` header, as intended).
- Manual: 105 rapid requests to `/health` → 99×200, 6×429 — throttling confirmed working at the 100 req/min/IP threshold.
- Independent `code-reviewer` subagent review: 0 critical, 1 high-priority finding (guard-ordering comment overstated NestJS's guarantee) — fixed same session, re-verified build/lint after the fix.
