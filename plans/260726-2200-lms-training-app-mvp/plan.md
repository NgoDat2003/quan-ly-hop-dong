---
title: 'Training App Base Skeleton (Monorepo + User/Auth Stub + Login Page)'
description: 'Compiling, booting Turborepo base: NestJS+Prisma API with User table and stubbed JWT/access-control wiring, envelope response DTOs, and a Next.js+shadcn web app whose only screen is a login page fed by Orval-generated hooks.'
status: completed
priority: P1
effort: 12h
branch: main
tags: [scaffold, skeleton, stub, structure, template, infra]
blockedBy: []
blocks: []
created: 2026-07-26
createdBy: 'ck:plan'
---

# Training App Base Skeleton (Monorepo + User/Auth Stub + Login Page)

## Overview

**This plan produces a compiling, booting, wired-together base skeleton with STUB implementations. It contains zero real business logic and exactly one domain table.**

Read that literally. Every file listed gets created at the right path, with correct class/interface signatures, correct decorators, and correct dependency-injection wiring into its parent module. **The method bodies are empty stubs** — `// TODO: implement`, a trivially-shaped hardcoded return, or `throw new Error('not implemented')`.

Nobody implements a feature here. There is no real login, no credential check, no database query that does anything meaningful. The deliverable is the **folder structure + wiring + conventions + a working contract pipeline**, proven by the fact that the whole thing compiles, boots, and generates a typed frontend client.

### Scope boundary (confirmed with the user, final)

| Surface               | In scope                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma schema         | **`User` model + `Role` enum. Nothing else.** No second table of any kind                                                               |
| Backend modules       | `prisma`, `common`, `access-control` (guards/decorators/strategy, stubbed), `auth`, `users`                                             |
| Backend endpoints     | `authLogin`, `authGetMe` — that is all                                                                                                  |
| Frontend pages        | **A login page. That is the only screen.** Plus the structural minimum App Router needs (root layout, providers, `(auth)` group layout) |
| "How to add a module" | **A markdown doc**, not scaffolded example files                                                                                        |

There is deliberately no second module to copy from. With one module there is nothing to generalize from code, so the pattern is written down as prose + a snippet in `apps/api/src/modules/README.md` instead of scaffolded as dead example files. This is the direct consequence of dropping the example domain module — a doc costs nothing to maintain; a stub module nobody uses rots.

### The stub/real line (applies to every phase)

| Category                                                                                            | Verdict                  | Why                                                                                             |
| --------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| File paths, file names, folder layout                                                               | **Real**                 | This IS the deliverable                                                                         |
| Module imports, `imports:`/`providers:`/`exports:` arrays, `APP_GUARD` registration                 | **Real**                 | Wiring is the deliverable; a mis-wired module doesn't boot                                      |
| Class/method signatures, constructor DI params, return types                                        | **Real**                 | Signatures are structure; they're what the next dev fills in                                    |
| Decorators (`@Controller`, `@Post`, `@ApiOperation`, `@IsEmail`, `@ApiProperty`)                    | **Real**                 | Declarative, not behavior. They generate the OpenAPI doc, which Orval needs                     |
| **Response envelope DTO classes**                                                                   | **Real**                 | New vs V3. The wire shape and the documented shape must match, or every generated type is a lie |
| `schema.prisma` field definitions                                                                   | **Real**                 | Schema fields are structure, not logic. Must be valid enough for `prisma migrate` to run once   |
| Framework bootstrap code that throws if absent (`$connect`, `super()` config, `NestFactory.create`) | **Real, minimum viable** | Written to _boot_, not to be secure or correct                                                  |
| **Service method bodies**                                                                           | **Stub**                 | Deferred                                                                                        |
| **Auth logic** (hash, compare, sign, verify-and-load-user)                                          | **Stub**                 | Deferred                                                                                        |
| **Permission evaluation, ownership checks**                                                         | **Stub**                 | Deferred                                                                                        |
| **Frontend action-hook bodies** (token persist / toast / invalidate / redirect)                     | **Stub**                 | Deferred                                                                                        |
| **Tests asserting behavior**                                                                        | **Cut**                  | There is no behavior. One harness-proof test per side only                                      |

Rule of thumb when in doubt: _if removing it stops the app from booting, or stops `tsc`/Orval from producing correct output, write the minimum real version. Otherwise stub it._

Stack: `apps/api` (NestJS + Prisma + PostgreSQL, Passport-JWT wiring, Swagger→OpenAPI export) + `apps/web` (Next.js App Router + React 19 + TanStack Query 5 + shadcn/ui, Orval-generated client) + `packages/eslint-config` + `packages/typescript-config`.

### Plan-level success criteria

The plan is done when all of these are observably true:

1. `pnpm build` exits 0 from repo root (both apps compile).
2. `pnpm dev` boots both apps with no runtime error — `nest start` reaches "Nest application successfully started", `next dev` serves `localhost:3000`.
3. Swagger UI at `localhost:3001/api` loads and lists the two stub endpoints with their **envelope-wrapped** DTO schemas.
4. `pnpm codegen` succeeds against the stub `openapi.json` and produces **real typed hooks** in `apps/web/lib/api/generated/` — concrete types, no `unknown` on DTO fields, and the generated response type is the `{ statusCode, data }` envelope that the wire actually carries.
5. `/login` renders, and submitting it fires a real `POST /auth/login` through the generated hook → mutator → API.
6. Exactly one Jest test per side passes, proving the test harness itself runs. Not proving behavior.
7. `pnpm lint` and `pnpm check-types` exit 0.

Nothing about correct _behavior_ is a success criterion, because nothing behaves yet.

**Contract direction is one-way:** backend DTO/Swagger → `openapi.json` → Orval → `apps/web/lib/api/generated/`. Frontend never hand-writes DTOs; generated dir never hand-edited. Generated output IS committed to git.

## Phases

| Phase | Name                                                                                | Effort | Status    |
| ----- | ----------------------------------------------------------------------------------- | ------ | --------- |
| 1     | [Monorepo Scaffold](./phase-01-monorepo-scaffold.md)                                | 4h     | Completed |
| 2     | [Backend Foundation: User + Auth Stub + Envelope](./phase-02-backend-foundation.md) | 3h     | Completed |
| 3     | [Frontend Foundation](./phase-03-frontend-foundation.md)                            | 3h     | Completed |
| 4     | [Login Page](./phase-04-login-page.md)                                              | 1h     | Completed |
| 5     | [Harness Proof + README](./phase-05-harness-and-readme.md)                          | 1h     | Completed |

Effort: 4h + 3h + 3h + 1h + 1h = **12h**.

> **Changed from V3 (14h / 6 phases → 12h / 5 phases).** V3's Phase 3 (Course module) is deleted outright — no Course model, module, controller, service, DTO, or UI anywhere. V3's Phase 5 (login + register + 3 course screens) collapses to a single login page. Remaining V3 phases renumbered: frontend-foundation 4→3, features 5→4, harness 6→5.
>
> Effort delta by phase: **−1.5h** deleting the Course phase entirely; **−0.5h** on frontend foundation (3.5h→3h: no `(app)` layout, nav, or user menu, since there is no authenticated area); **−0.5h** on the feature phase (1.5h→1h: five screens → one); **+0.5h** on harness (0.5h→1h: the "how to add a module" doc must now carry what the deleted example module used to show). Phase 2 stays 3h — removing the Course model and register endpoint pays for the envelope DTO classes the user asked to restore.

## Dependency Graph

```
P1 (scaffold)
 ├──> P2 (backend: Postgres, Prisma User, auth wiring, envelope DTOs, OpenAPI export)
 │       │
 └──> P3 (frontend foundation) ──┐
         ^                        │
         └── P3's codegen step is gated on P2's openapi.json
                                  │
                                  └──> P4 (login page) ──> P5 (harness proof + README)
```

- P2 and P3 may run in parallel after P1 (disjoint file ownership: `apps/api/**` vs `apps/web/**`).
- P3's **codegen step only** is gated on P2 — it needs a populated `openapi.json`. Scaffold all of P3 first; run codegen once P2 lands.
- P4 strictly after P2 + P3. P5 after P4.

## File Ownership (parallel safety)

| Phase | Owns                                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | repo root files, `packages/**`                                                                                                                                                            |
| 2     | `docker-compose.yml`, `apps/api/prisma/**`, `apps/api/src/**`, `apps/api/scripts/**`, `apps/api/package.json`                                                                             |
| 3     | `apps/web/app/{layout.tsx,globals.css,providers.tsx}`, `apps/web/app/(auth)/layout.tsx`, `apps/web/lib/**`, `apps/web/orval.config.ts`, `apps/web/components/**`, `apps/web/package.json` |
| 4     | `apps/web/app/(auth)/login/**`, `apps/web/features/auth/**`                                                                                                                               |
| 5     | `**/*.spec.ts(x)`, jest configs, root `README.md`, `apps/api/src/modules/README.md`                                                                                                       |

Shared-file exceptions requiring serialization: root `package.json` (P1 creates, P3 adds codegen wiring). With Course gone, `app.module.ts` is now owned entirely by P2 — no second writer.

## Resolved Decisions

| Question                      | Decision                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Depth of implementation**   | **Structure/wiring only.** Files exist at correct paths with correct signatures and wiring; method bodies are stubs. Confirmed by the user: "Tạo đủ file/module nhưng code rỗng/placeholder".                                                                                                                                                                                                  |
| **Domain scope**              | **`User` + `Role` only.** Confirmed verbatim: _"vẫn thừa chỉ cần bảng user và làm tới bước jwt luôn cx đc FE thì làm 1 trang login thôi là coi như xong base bỏ course đi luôn"_. No second table, module, or screen.                                                                                                                                                                          |
| **Response envelope**         | **Restored, and real.** Concrete per-endpoint wrapper classes (`AuthLoginResponseDto extends ApiResponseDto`) documented via `type:` in `@ApiOkResponse`. Chosen over the generic `@ApiExtraModels` + `getSchemaPath` + `allOf` pattern — rationale in Phase 2 Key Insights. The wire shape from `TransformInterceptor` and the OpenAPI schema now match, so generated Orval types are honest. |
| Frontend UI scope             | **Login page only.** No register page, no dashboard, no `(app)` route group.                                                                                                                                                                                                                                                                                                                   |
| "How to add a module" example | **A doc** (`apps/api/src/modules/README.md`, delivered in Phase 5), not scaffolded files. There is no second module to copy from, and a dead example module rots.                                                                                                                                                                                                                              |
| Commit Orval output           | **Yes — commit `apps/web/lib/api/generated/`.** Fresh clone type-checks and builds without a DB. Never hand-edited.                                                                                                                                                                                                                                                                            |
| Local Postgres                | **Docker Compose.** Required — `prisma migrate` must run once to prove the schema is valid, and `openapi:generate` boots the Nest app (which `$connect`s).                                                                                                                                                                                                                                     |
| Seed data                     | **Cut entirely.** Seeding is data, and there is no logic to exercise with it. `prisma/seed.ts` is not created.                                                                                                                                                                                                                                                                                 |
| `JwtStrategy.validate()`      | **Stub body, real constructor.** `super({...secretOrKey})` must be real — `passport-jwt` throws at construction if the secret is undefined, crashing bootstrap. `validate()` is only called per-request, never at boot. See Phase 2.                                                                                                                                                           |
| Register endpoint             | **Cut.** The user asked for a login page only; a register endpoint with no consumer is dead surface. `UsersService.create()` remains declared as a stub signature so whoever adds registration has the slot.                                                                                                                                                                                   |

## Non-Negotiable Architecture Rules (all phases)

These are **file-organization** rules and they apply fully — proving the structure is right is the entire point of this plan.

- **FE:** components render-only; `features/auth/hooks/use-auth-actions.ts` must EXIST and own every side-effect, even with stub bodies; 300-line soft cap; never hand-edit `lib/api/generated/`.
- **BE:** controllers thin (route decorators + one service call, nothing else); one owning module per table; `exports:` declared so the next module can inject.
- Explicit `operationId` on every endpoint (drives Orval hook names).
- kebab-case filenames everywhere.

Rules about **business-logic quality** (error-handling depth, edge cases, N+1 avoidance, ownership checks) do **not** apply — there is no logic to hold to a standard.

## Not in Scope / Deferred

**Deferred — top-line, above everything else:**

- **ALL BUSINESS LOGIC.** Real auth (password hashing, credential verification, token signing, JWT verification + user loading), any Prisma query that reads or writes meaningfully, real permission evaluation, real cache-invalidation/toast/redirect side-effects. This plan delivers **structure and wiring only**. Every stub is a `// TODO: implement` waiting for the team.

**Deferred domain — no schema, module, UI, or test for any of these:**

- **Any table beyond `User`.** No course, lesson, quiz, enrollment, progress — none of it, not even as a stub example.
- Registration, password reset, email verification, refresh-token rotation, SSO/OAuth, MFA.
- Any screen other than `/login` — no dashboard, no list view, no `(app)` route group, no nav chrome.

**Deferred regardless of domain (infra/product maturity):**

- Seed data, reporting/analytics, export, org hierarchy.
- Real-time notifications, email delivery, file upload.
- Fine-grained resource-level ACL, soft deletes, audit trail.
- i18n, dark mode beyond shadcn defaults, e2e browser tests, CI/CD pipeline, production deploy.
- Rate limiting, pagination, full-text search. (`PaginationQueryDto` is **not** created — no endpoint lists anything.)
- Behavior tests of any kind (there is no behavior to test).

## Key Dependencies (external)

- Node >= 18 (research tested on 24.x), pnpm 11.x, Turborepo 2.x.
- **Docker + Docker Compose** for the local Postgres container — required before Phase 2 migrate, and before `openapi:generate`.
- Network access for `shadcn@latest init`, npm registry.

## Research Context

- [Frontend stack report](./research/researcher-01-frontend-stack-report.md)
- [Backend stack report](./research/researcher-02-backend-stack-report.md)
- Architecture rules: `CLAUDE.md`, `.agent/projectRules/frontend-architecture.md`, `.agent/projectRules/backend-architecture.md`

> Research reports were written against the original wider LMS scope. They are kept as **stack-wiring** references only (how to configure Turborepo/pnpm/shadcn/Orval, which package APIs to call for Prisma/NestJS/Passport). Their domain-model and business-logic sections are superseded — this plan implements none of it.
