---
title: 'Base Template Hardening: Error Handling, Env Validation, Health Check, Tooling Fixes'
description: 'Small, independent hardening fixes for the training-app base template — surfaced via cross-repo comparison against a mature reference monorepo (maycha_QAQC_app) and a code-review pass. Not new features; quality-of-life for a repo that will be cloned repeatedly.'
status: completed
priority: P2
effort: '2.5h'
branch: 'main'
tags: [base-template, hardening, tooling, backend]
blockedBy: []
blocks: []
created: '2026-07-27T05:50:07.740Z'
createdBy: 'ck:plan'
source: skill
---

# Base Template Hardening: Error Handling, Env Validation, Health Check, Tooling Fixes

## Overview

`training-app` is a base template meant to be cloned as the starting point for every future project (per the user, the name itself is arbitrary — its purpose is the scaffold, not this specific project). The 5-phase scaffold plan (`260726-2200-lms-training-app-mvp`) is complete. This plan addresses smaller hardening items surfaced two ways in the same session:

1. **Cross-repo comparison** against `maycha_QAQC_app` (a mature, unrelated monorepo on the same machine, same Turborepo/pnpm stack but Mongoose/MongoDB + Ant Design instead of Prisma/Postgres + shadcn) — used only to spot framework-agnostic infra patterns worth adopting, never to copy stack-specific code.
2. **A `/code-review` pass** on the completed scaffold, which found the `turbo.json` task-graph issue and the ESLint/Docker items below.

None of this is new product functionality. Everything here is scoped to "necessary and reasonable for a base template" (the user's own framing) — explicitly excluding storage/S3, session-store-separate-from-User, and any other item that would require a real architectural decision rather than a self-contained fix. See `brainstorm-summary.md` in this directory for the full comparison and the decisions on what was excluded and why.

## Phases

| Phase | Name                                                                                     | Effort | Status    |
| ----- | ---------------------------------------------------------------------------------------- | ------ | --------- |
| 1     | [Exception Filter and Health Module](./phase-01-exception-filter-and-health-module.md)   | 1h     | Completed |
| 2     | [Env Validation and Turbo Task Graph](./phase-02-env-validation-and-turbo-task-graph.md) | 1h     | Completed |
| 3     | [ESLint Passthrough Comments](./phase-03-tooling-cleanup-eslint-passthrough.md)          | 15m    | Completed |
| 4     | [Docker Container Naming](./phase-04-docker-naming.md)                                   | 10m    | Completed |

Effort: 1h + 1h + 15m + 10m ≈ **2.5h** (plus unplanned root-cause investigation — see below).

## Unplanned Discovery: `DATABASE_URL` never loaded into `process.env` (fixed)

While verifying Phase 1's Health module (the first code path in the entire project to issue a real Prisma query — every prior stub never touched the database), a pre-existing bug in the original scaffold plan surfaced: `ConfigModule.forRoot()` does not mutate global `process.env` for code reading it directly, so `PrismaService` always read `DATABASE_URL` as `undefined` and silently fell back to an unrelated native Postgres service running on this machine. Fixed with `import 'dotenv/config'` as the first import in `apps/api/src/main.ts` (mirroring the pattern already used in `prisma.config.ts` for CLI commands), verified end-to-end by stopping/starting the actual Docker container and confirming `/health` tracked its state exactly. A secondary, unrelated `tsconfig.json` `outDir` misresolution bug (TypeScript issue microsoft/typescript#29172 — relative paths in an extended config resolve against that file's location, not the extending file's) was also found and fixed in the same investigation. Full details in `phase-01-exception-filter-and-health-module.md`'s "Unplanned discovery" section. Both fixes were independently re-verified by a second code-review pass before being considered done.

## Dependency Graph

All 4 phases are mutually independent — no phase's success criteria depend on another phase's changes. They can be implemented in any order, or in parallel if desired (no file overlap: Phase 1 touches `common/filters` + `modules/health` + `app.controller.ts`; Phase 2 touches `src/config` + `turbo.json`; Phase 3 touches `packages/eslint-config`; Phase 4 touches `docker-compose.yml`).

```
P1 (exception filter + health module)   — independent
P2 (env validation + turbo task graph)  — independent
P3 (eslint passthrough comments)        — independent
P4 (docker container naming)            — independent
```

## Explicitly Out of Scope (decided during brainstorm)

- **Storage module (S3/MinIO)** — requires a new Docker service + object-storage provider decision; not a "free win."
- **Auth-sessions module** (session storage separate from `User`) — changes the data model; a real architectural decision, not a hardening fix.
- **Any QAQC domain module** (audit, training, criteria, brands, stores, notifications) — business logic specific to the reference project, irrelevant to a base template.
- **Adopting `maycha_QAQC_app`'s error-response shape** (`{statusCode, code, message}`) — would change the Orval-generated envelope contract; A keeps its existing `{statusCode, message, error}` shape, only widens what gets caught.
- **Backend module folder structure** — compared against the reference project's mature module shape (`dto/`, `schema/`, `services/`, `constants/`) and confirmed the base template's current structure (`access-control/{decorators,guards,strategies}`, `auth/dto`, `users/dto`) already matches the YAGNI-driven convention documented in `apps/api/src/modules/README.md`. No folder scaffolding needed — see `brainstorm-summary.md` for the full reasoning.

## Success Criteria (plan-level)

1. `pnpm build && pnpm lint && pnpm check-types && pnpm test` all exit 0 from repo root after all 4 phases.
2. Full workspace re-verification matches or improves on the baseline established at the end of the original scaffold plan — no regression.
3. Root README updated wherever a phase changes observable behavior (health endpoint response shape).

## Research Context

- [Brainstorm summary](./brainstorm-summary.md) — full cross-repo comparison, options considered, and exclusion rationale.
- Original scaffold plan: `../260726-2200-lms-training-app-mvp/plan.md` (completed, 5/5 phases).
