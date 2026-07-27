---
phase: 2
title: 'Env Validation and Turbo Task Graph'
status: completed
priority: P2
effort: '1h'
dependencies: []
---

# Phase 2: Env Validation and Turbo Task Graph

## Overview

Two independent fixes bundled for efficiency (both are root-level config, neither touches app code): add zod-based env validation to `apps/api` so missing/malformed env vars fail fast at boot with a clear message, and fix `turbo.json`'s `lint`/`check-types`/`test` tasks to depend on `^lint`/`^check-types`/`^test` instead of `^build` — the current `^build` dependency works today only because `packages/eslint-config` and `packages/typescript-config` have no `build` script, so turbo silently no-ops that dependency rather than expressing a real ordering constraint.

## Key Insights

- **Do not copy the mature reference project's env schema wholesale.** `maycha_QAQC_app` validates ~25 vars (MongoDB, MinIO, cookie names) — none of which exist in this app. Validate only what `apps/api` actually reads via `ConfigService.get()`: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `WEB_ORIGIN`.
- **Must not break the "boots with no `.env` file present" success criterion from Phase 2 of the original scaffold plan.** Every validated var needs either a sensible default in the zod schema or must already have a hardcoded fallback in code (`JWT_SECRET` already falls back to `'dev-placeholder-secret'` in two places). The validator should mirror those same fallbacks, not introduce a stricter requirement that breaks the existing boot guarantee.
- **Turbo tolerates missing scripts silently** — confirmed via `turbo run lint --dry=json` during code review: a package with no matching script produces a phantom `<NONEXISTENT>` task marked done. This means changing `^build` to `^lint` for config packages changes nothing functionally (they still have no `lint`/`check-types`/`test` script either) — the fix is about correctness of intent, not behavior change. Verify this stays true after the change (re-run `--dry=json`).

## Requirements

**Functional**

- `apps/api` boot fails immediately with a readable error listing every invalid/missing env var, if any required var is genuinely missing (not covered by a default).
- `apps/api` still boots successfully with **zero** `.env` file present (all current vars have defaults matching existing code fallbacks).
- `turbo.json`'s `lint`, `check-types`, `test` tasks depend on their own upstream task (`^lint`, `^check-types`, `^test`), not `^build`.

**Non-functional**

- No new required env var that isn't already read somewhere in `apps/api`.

## Architecture

```
apps/api/src/config/
└── env.schema.ts   # CREATE — zod schema + validateEnv() function

apps/api/src/app.module.ts   # MODIFY — ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })

turbo.json   # MODIFY — dependsOn changes on lint/check-types/test
```

## Related Code Files

**Create:** `apps/api/src/config/env.schema.ts`.

**Modify:** `apps/api/src/app.module.ts`, `turbo.json`.

## Implementation Steps

1. **Write `env.schema.ts`** modeled on the reference project's `validateEnv` pattern but scoped to actual vars:

   ```typescript
   import { z } from 'zod';

   const envSchema = z.object({
     DATABASE_URL: z.string().min(1).optional(), // PrismaService reads it via adapter; no schema-level default needed since docker-compose + .env.example provide it in dev
     JWT_SECRET: z.string().min(1).default('dev-placeholder-secret'),
     PORT: z.coerce.number().int().positive().default(3001),
     WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
   });

   export type AppEnv = z.infer<typeof envSchema>;

   export function validateEnv(config: Record<string, unknown>): AppEnv {
     const result = envSchema.safeParse(config);
     if (!result.success) {
       const issues = result.error.issues
         .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
         .join('\n');
       throw new Error(`Invalid environment configuration:\n${issues}`);
     }
     return result.data;
   }
   ```

   Note `DATABASE_URL` needs care: `PrismaService`'s `PrismaPg` adapter reads `process.env.DATABASE_URL` directly (not via `ConfigService`), so leaving it optional/undefined here won't break boot in the "no .env" case the same way `JWT_SECRET`'s in-code fallback does — but the Docker+`.env.example` flow always provides it in practice. Decide during implementation whether to add a placeholder default here too, or leave the DB connection failure as the natural signal (it already fails loudly if Postgres isn't reachable, per the existing `$connect()` behavior).

2. **Wire into `ConfigModule`**: `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` in `app.module.ts`.

3. **Verify the "no `.env` file" boot guarantee still holds** — this is the step most likely to break something. Temporarily rename `apps/api/.env`, run `pnpm --filter=api dev`, confirm it still reaches "Nest application successfully started" (same check as the original Phase 2 success criterion). Restore the file after.

4. **Fix `turbo.json`**: change

   ```json
   "lint": { "dependsOn": ["^build"], "outputs": [] },
   "check-types": { "dependsOn": ["^build"], "outputs": [] },
   "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
   ```

   to

   ```json
   "lint": { "dependsOn": ["^lint"], "outputs": [] },
   "check-types": { "dependsOn": ["^check-types"], "outputs": [] },
   "test": { "dependsOn": ["^test"], "outputs": ["coverage/**"] },
   ```

   Leave `build`'s `dependsOn: ["^build"]` untouched — that one is correct (apps genuinely need config packages' — nonexistent — build output, or more precisely, apps need to build in dependency order, which `^build` still correctly expresses even for packages with no build script since turbo still resolves the workspace graph edge).

5. **Re-verify** `pnpm build && pnpm lint && pnpm check-types && pnpm test` from repo root — full green, same as before the change (behavior should be identical, this is a correctness-of-intent fix not a behavior change).

## Success Criteria

- [x] `apps/api/src/config/env.schema.ts` exists, validates only vars actually read by the app (`JWT_SECRET`, `JWT_EXPIRES_IN` — added after code review caught the initial omission, `PORT`, `WEB_ORIGIN`).
- [x] `apps/api` boots successfully with `apps/api/.env` absent (re-verified live, not assumed).
- [x] `apps/api` boot fails with a clear, readable error message if a required var is deliberately made invalid (test this once, then revert).
- [x] `turbo.json`'s `lint`/`check-types`/`test` tasks depend on `^lint`/`^check-types`/`^test` respectively; `build` task unchanged.
- [x] `pnpm turbo run lint --dry=json` (or equivalent) confirms the task graph resolves without error for `packages/eslint-config` and `packages/typescript-config`.
- [x] Full workspace `pnpm build && pnpm lint && pnpm check-types && pnpm test` all exit 0, identical results to pre-change baseline.

**Note:** this phase's env-validation work is what led to discovering (during Phase 1's health-check verification) that `process.env.DATABASE_URL` was never actually populated at runtime — see the note in `phase-01-exception-filter-and-health-module.md` for the full root-cause writeup and fix (`import 'dotenv/config'` in `main.ts`).

## Risk Assessment

| #   | Risk                                                                                                                                                                      | Likelihood | Impact   | Mitigation                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Env validation breaks the "boots with no .env" success criterion from the original Phase 2                                                                                | Med        | **High** | Explicit verification step (Step 3) re-runs the exact original test before considering this phase done                                               |
| R2  | `DATABASE_URL` validation is stricter than `PrismaService`'s actual runtime behavior, causing a confusing double-error (zod validation error AND Prisma connection error) | Low        | Low      | Keep `DATABASE_URL` optional in the schema per Step 1's note; let the existing Prisma `$connect()` failure be the natural signal, don't duplicate it |
| R3  | Changing turbo's `dependsOn` changes caching behavior in a way that breaks CI (if any exists) or local dev expectations                                                   | Low        | Low      | Behavior should be identical since config packages have no matching scripts either way — verified via dry-run in Step 5                              |

**Rollback:** both changes are isolated and reversible — revert `env.schema.ts` deletion + `app.module.ts` line, revert `turbo.json` three lines.
