---
phase: 1
title: 'Exception Filter and Health Module'
status: completed
priority: P2
effort: '1h'
dependencies: []
---

# Phase 1: Exception Filter and Health Module

## Overview

Two independent, low-risk additions to `apps/api`: broaden the exception filter to catch non-`HttpException` errors (currently a dormant gap — no code throws anything else yet, but the first real Prisma call will), and replace the ad hoc `AppController.health()` endpoint with a proper `@nestjs/terminus` health module that checks Postgres connectivity.

## Requirements

**Functional**

- Any thrown error (not just `HttpException`) produces a `500` response with a generic, non-leaking message — never the real error message or stack trace.
- `GET /health` (or wherever Terminus mounts it) returns Postgres up/down status, is `@Public()`, and stays excluded from the Orval-generated client.

**Non-functional**

- No change to the existing `{statusCode, message, error}` shape for `HttpException`-derived errors — only the fallback branch for non-`HttpException` errors is new.
- Root README's boot-verification steps must still hold (health-equivalent check still passes).

## Architecture

```
apps/api/src/
├── common/filters/http-exception.filter.ts   # MODIFY: @Catch(HttpException) -> @Catch()
├── app.controller.ts                          # MODIFY: remove health()
└── modules/health/
    ├── health.module.ts                       # CREATE
    └── health.controller.ts                   # CREATE
```

**Error flow after this phase:**

```
Any thrown error → HttpExceptionFilter (@Catch())
  ├─ instanceof HttpException → existing normalizeHttpException path (unchanged)
  └─ anything else            → NEW: 500 { statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' }
```

## Related Code Files

**Modify:** `apps/api/src/common/filters/http-exception.filter.ts`, `apps/api/src/app.controller.ts`, `apps/api/src/app.module.ts` (register `HealthModule`), `apps/api/package.json` (add `@nestjs/terminus`), root `README.md` (boot-verification step referencing `/health`).

**Create:** `apps/api/src/modules/health/health.module.ts`, `apps/api/src/modules/health/health.controller.ts`.

## Implementation Steps

1. **Install `@nestjs/terminus`**: `pnpm --filter=api add @nestjs/terminus`.

2. **Broaden `HttpExceptionFilter`** — change `@Catch(HttpException)` to `@Catch()` (catches everything). Keep the existing `instanceof HttpException` branch untouched. Add an `else` branch:

   ```typescript
   response.status(500).json({
     statusCode: 500,
     message: 'Internal server error',
     error: 'Internal Server Error',
   });
   ```

   Never include `exception.message` or `exception.stack` in the response body — that's the whole point of this fix.

3. **Create `HealthController`** using `@nestjs/terminus`'s `HealthCheckService` + a `PrismaHealthIndicator`-equivalent check. Since there's no built-in Prisma indicator, write a minimal custom check using `HealthIndicatorService` (Terminus 10+ API) or the older `HealthIndicator` base class — whichever matches the installed `@nestjs/terminus` version — that runs `SELECT 1` via `PrismaService`. Mark the endpoint `@Public()` and exclude it from Swagger with `@ApiExcludeEndpoint()` (same reasoning as the old health endpoint — infra check, not a domain endpoint, keep out of the Orval client).

4. **Remove `AppController.health()`** entirely — `AppController` becomes empty or is deleted if it has no other purpose. Check `app.module.ts` for any other reference to `AppController` before deleting the class outright; if nothing else uses it, delete `app.controller.ts` and drop it from `app.module.ts`'s `controllers` array.

5. **Register `HealthModule`** in `app.module.ts`.

6. **Update root `README.md`** — the boot-verification section currently says `curl localhost:3001/health` → `{"status":"ok"}`. Update to reflect Terminus's actual response shape (a `{status, info, error, details}` object), and re-run the verification step for real before editing the doc.

7. **Verify**: boot `apps/api`, confirm the health endpoint responds with Postgres status `up`, confirm Swagger does NOT list a health operationId, confirm `pnpm codegen` doesn't produce a health-related hook.

## Success Criteria

- [x] `HttpExceptionFilter` uses `@Catch()`, not `@Catch(HttpException)`.
- [x] A deliberately-thrown non-`HttpException` error (e.g. temporarily throw `new Error('test')` in a stub method, verify, then revert) produces `{statusCode: 500, message: 'Internal server error', ...}` — not the real message.
- [x] `HealthModule` exists, boots, and its endpoint reports Postgres connectivity via a real query (not a hardcoded `true`).
- [x] Health endpoint carries `@Public()` and `@ApiExcludeEndpoint()`.
- [x] `apps/api/openapi.json` contains no health-related operationId; `apps/web/lib/api/generated/` contains no health-related hook after `pnpm codegen`.
- [x] `pnpm --filter=api build`, `lint`, `check-types`, `test` all exit 0.
- [x] Full workspace `pnpm build && pnpm lint && pnpm check-types && pnpm test` still green.
- [x] Root README's boot-verification section reflects the new health response shape. (Root README didn't reference the old `/health` shape at all, so nothing was stale — confirmed via grep, no edit needed.)

## Unplanned discovery during this phase's verification (important)

Wiring the Health module's real `$queryRaw` check surfaced a **pre-existing bug in the original scaffold plan** (`plans/260726-2200-lms-training-app-mvp/`), invisible until now because every prior Prisma-touching code path was a stub that never issued a real query:

**Root cause:** `apps/api/src/app.module.ts`'s `ConfigModule.forRoot({isGlobal: true})` populates `ConfigService` but does **not** reliably mutate global `process.env` for code that reads `process.env.X` directly. `PrismaService` reads `process.env.DATABASE_URL` directly — so it was always `undefined`, and the underlying `pg` driver silently fell back to Postgres defaults (`localhost:5432`), which happened to hit an unrelated **native Postgres service already running on this machine** (the same one that caused the port conflict at the very start of the original scaffold session). `$connect()` "succeeded" against the wrong database; the first real query (`$queryRaw` in the new health check) failed with a SASL/password error because the fallback connection had no explicit credentials.

**Fix:** added `import 'dotenv/config'` as the first import in `apps/api/src/main.ts`, mirroring the pattern `prisma.config.ts` already used for CLI commands. Verified end-to-end: stopped/started the actual Docker Postgres container mid-session and confirmed `/health` tracked that container's state exactly (200 up / 503 down), ruling out coincidental success against a different Postgres instance. A second reviewer pass independently re-verified every claim (import order, `dotenv`'s non-destructive override semantics, live reproduction) rather than trusting the description.

**Side discovery:** the same fix silently also corrects `WEB_ORIGIN` and `PORT` (both read via raw `process.env` in `main.ts`), which were equally undefined before and always fell back to their hardcoded defaults regardless of `.env` contents — not just `DATABASE_URL` was affected.

**Secondary unrelated bug fixed in the same pass:** `apps/api/tsconfig.json` didn't override `outDir`, so the `outDir: "dist"` relative path inherited from `packages/typescript-config/nestjs.json` was resolved relative to _that file's_ location (a documented TypeScript behavior, microsoft/typescript#29172), producing build output at `packages/typescript-config/dist/` instead of `apps/api/dist/`. Fixed by adding `"outDir": "./dist"` to `apps/api/tsconfig.json` directly. Confirmed `apps/web` does not share this bug class (Next.js's own bundler governs its output, not raw `tsc`).

## Risk Assessment

| #   | Risk                                                                                                                                                                                 | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `@nestjs/terminus` version installed doesn't match the Nest 10.x already in use, causing a peer-dep or API mismatch (Terminus's health-indicator API changed between major versions) | Med        | Med    | Check installed `@nestjs/terminus` version against `@nestjs/common`/`@nestjs/core` (both `^10.4.0`) before writing the custom indicator; use whichever indicator API (class-based vs `HealthIndicatorService`) matches what actually installs |
| R2  | Removing `AppController` breaks something unexpectedly wired to it                                                                                                                   | Low        | Low    | Grep for `AppController` usage before deleting; `app.module.ts` is the only other file that references it per Phase 1 of the original plan                                                                                                    |
| R3  | Broadening `@Catch()` accidentally intercepts an error NestJS itself expects to handle specially (e.g. WebSocket exceptions)                                                         | Low        | Low    | This app has no WebSocket gateways; `@Catch()` on a global HTTP exception filter is standard practice, confirmed by the mature reference project (`maycha_QAQC_app`)'s `ApiExceptionFilter` using the identical pattern                       |

**Rollback:** both changes are additive/replacing a stub; revert the two modified files and delete the new module folder.
