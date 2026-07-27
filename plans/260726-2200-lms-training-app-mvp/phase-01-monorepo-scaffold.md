---
phase: 1
title: 'Monorepo Scaffold'
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Monorepo Scaffold

## Context Links

- [Frontend stack report §1](./research/researcher-01-frontend-stack-report.md)
- `CLAUDE.md` → Apps Structure, Development Commands
- Blocks: Phase 2, Phase 3

## Overview

**Priority:** P1 | **Status:** Pending | **Effort:** ~4h

Turn empty repo into working Turborepo + pnpm workspace with two app skeletons and two shared config packages. Exit condition: `pnpm install && pnpm build && pnpm lint` green from repo root, both apps boot on distinct ports.

### Stub vs Real in this phase

**Everything here is real** — and that is not an exception to the plan's stub rule, it is the rule applied. This phase produces only config files, workspace topology, and two empty app shells. There is no business logic in scope to stub, because build config either works or the repo doesn't build.

The only "code" written is `app.controller.ts`'s `health()` returning `{ status: 'ok' }` and a placeholder `page.tsx` — both are boot-proofs, not features.

## Key Insights

- Do **not** use `pnpm dlx shadcn@latest init --monorepo` here — it scaffolds its own `apps/web` + `packages/ui` layout that conflicts with the confirmed structure. shadcn is initialized inside the existing `apps/web` in Phase 3 instead.
- `create-turbo` is convenient but produces extra example packages; simpler + more predictable to hand-write the 5 root files. Manual scaffold chosen (KISS, no cleanup churn).
- Turborepo `codegen` task must declare `outputs: ["lib/api/generated/**"]` so cache invalidation works; also `cache: false` on `dev`.
- pnpm workspaces do NOT hoist by default — each app declares its own deps. `packages/*` referenced as `workspace:*`.
- `packages/eslint-config` and `packages/typescript-config` must be `private: true` and export config files directly (no build step) to avoid a chicken-and-egg build order.

## Requirements

**Functional**

- Root workspace recognizes `apps/*` and `packages/*`.
- `apps/api` = NestJS app skeleton (bootstraps, `GET /health` returns 200).
- `apps/web` = Next.js App Router skeleton (renders placeholder page).
- Shared ESLint + TS config consumed by both apps.
- Root scripts: `dev`, `build`, `lint`, `format`, `test`, `check-types`, `codegen`.

**Non-functional**

- Node >= 18 enforced via `engines`.
- pnpm pinned via `packageManager`.
- `pnpm-lock.yaml` committed.
- Ports: api 3001, web 3000 (avoid collision; web is the browser-facing default).

## Architecture

```
training-app/
├── package.json              # private root, scripts delegate to turbo
├── pnpm-workspace.yaml
├── turbo.json
├── .gitignore
├── .npmrc
├── apps/
│   ├── api/                  # NestJS
│   └── web/                  # Next.js App Router
└── packages/
    ├── eslint-config/
    └── typescript-config/
```

Data flow: none yet. This phase only establishes build-graph topology — turbo resolves `build` dependencies via `dependsOn: ["^build"]` so config packages resolve before apps.

## Related Code Files

**Create (root)**

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `.gitignore`
- `.npmrc`
- `.env.example`

**Create (`packages/typescript-config/`)**

- `package.json`, `base.json`, `nextjs.json`, `nestjs.json`

**Create (`packages/eslint-config/`)**

- `package.json`, `base.js`, `next.js`, `nest.js`

**Create (`apps/api/`)**

- `package.json`, `tsconfig.json`, `nest-cli.json`, `eslint.config.js`, `jest.config.js`
- `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`

**Create (`apps/web/`)**

- `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.js`, `jest.config.js`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

## Implementation Steps

1. **Root config files.**

   `pnpm-workspace.yaml`:

   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```

   `.npmrc`:

   ```
   auto-install-peers=true
   strict-peer-dependencies=false
   ```

   `turbo.json`:

   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "tasks": {
       "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
       "dev": { "cache": false, "persistent": true },
       "lint": { "dependsOn": ["^build"], "outputs": [] },
       "check-types": { "dependsOn": ["^build"], "outputs": [] },
       "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
       "codegen": { "outputs": ["lib/api/generated/**"] },
       "openapi:generate": { "outputs": ["openapi.json"] }
     }
   }
   ```

   Root `package.json`:

   ```json
   {
     "name": "training-app",
     "private": true,
     "packageManager": "pnpm@11.12.0",
     "engines": { "node": ">=18" },
     "scripts": {
       "dev": "turbo run dev",
       "build": "turbo run build",
       "lint": "turbo run lint",
       "check-types": "turbo run check-types",
       "test": "turbo run test",
       "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
       "codegen": "pnpm codegen:api && pnpm codegen:web",
       "codegen:api": "pnpm --filter=api openapi:generate",
       "codegen:web": "pnpm --filter=web codegen"
     },
     "devDependencies": { "turbo": "^2.10.0", "prettier": "^3.3.0", "typescript": "^5.6.0" }
   }
   ```

   Note: `codegen` is intentionally a sequential pnpm chain, NOT `turbo run codegen` — the API export must complete before Orval reads the file, and turbo would run both in parallel.

   `.gitignore`: `node_modules`, `.next`, `dist`, `.turbo`, `coverage`, `.env`, `.env.local`, `apps/api/openapi.json` (regenerable artifact — see Risk R3 for the alternative).

   **Do NOT gitignore `apps/web/lib/api/generated/`** — the Orval output is committed on purpose (decision in `plan.md`), so a fresh clone type-checks without a database. Add an explicit negation comment there to stop anyone "tidying it up" into `.gitignore` later.

2. **`packages/typescript-config`.** `package.json` `{ "name": "@repo/typescript-config", "version": "0.0.0", "private": true, "files": ["*.json"] }`. `base.json` with `strict: true`, `esModuleInterop`, `skipLibCheck`, `target: ES2022`, `moduleResolution: bundler`. `nextjs.json` extends base + `jsx: preserve`, `plugins: [{name:"next"}]`, `noEmit`. `nestjs.json` extends base + `module: commonjs`, `experimentalDecorators`, `emitDecoratorMetadata`, `target: ES2021`, `outDir: dist`.

3. **`packages/eslint-config`.** `package.json` `{ "name": "@repo/eslint-config", "private": true, "type": "module", "exports": {"./base":"./base.js","./next":"./next.js","./nest":"./nest.js"} }`. Flat config (ESLint 9). Keep rules lenient per development-rules (no harsh linting) — `@typescript-eslint/no-explicit-any: warn`, unused vars warn with `^_` ignore pattern.

4. **`apps/api` skeleton.** Deps: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`. Dev: `@nestjs/cli`, `@nestjs/testing`, `@types/node`, `jest`, `ts-jest`, `ts-node`, `typescript`, `@repo/typescript-config`, `@repo/eslint-config` (both `workspace:*`).
   Scripts: `dev: nest start --watch`, `build: nest build`, `lint: eslint src`, `check-types: tsc --noEmit`, `test: jest`.
   `src/main.ts` minimal: `NestFactory.create(AppModule)` + `app.listen(process.env.PORT ?? 3001)`. Swagger/ValidationPipe come in Phase 2.
   `src/app.module.ts` declares only `AppController` for now — Phase 2 owns every later addition to this file, so there is no second writer.
   `src/app.controller.ts`: `@Get('health') health() { return { status: 'ok' }; }`.

5. **`apps/web` skeleton.** Deps: `next`, `react@^19`, `react-dom@^19`. Dev: `@types/react`, `@types/node`, `typescript`, `@repo/*` configs, `jest`, `jest-environment-jsdom`, `@testing-library/react`.
   Scripts: `dev: next dev --port 3000`, `build: next build`, `lint: eslint .`, `check-types: tsc --noEmit`, `test: jest`. (`codegen` script added in Phase 3.)
   `app/layout.tsx` + `app/page.tsx` placeholder. Tailwind NOT yet installed — Phase 3.

6. **Install + verify.** `pnpm install` at root → lockfile generated. Run `pnpm build`, `pnpm lint`, `pnpm check-types`.

7. **Smoke test both apps.** `pnpm dev` → `curl http://localhost:3001/health` returns `{"status":"ok"}`; `http://localhost:3000` renders placeholder.

8. **Commit.** `feat: scaffold turborepo monorepo with api and web apps`.

## Todo List

- [x] Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.npmrc`, `.env.example`
- [x] `packages/typescript-config` (base/nextjs/nestjs)
- [x] `packages/eslint-config` (base/next/nest, flat config)
- [x] `apps/api` NestJS skeleton + `/health`
- [x] `apps/web` Next.js App Router skeleton
- [x] `pnpm install` → lockfile committed
- [x] `pnpm build && pnpm lint && pnpm check-types` all green
- [x] Both apps boot on 3001 / 3000
- [x] Commit

## Success Criteria

- [x] `pnpm install` completes with no unmet peer errors blocking install.
- [x] `pnpm build` exits 0; `apps/api/dist` and `apps/web/.next` produced.
- [x] `pnpm lint` and `pnpm check-types` exit 0.
- [x] `curl localhost:3001/health` → `{"status":"ok"}`. (Superseded 2026-07-27 by `plans/260727-1500-base-template-hardening` Phase 1: `/health` now backed by `@nestjs/terminus`, returns `{status, info, error, details}` with a real Postgres check. Verified true at the time this phase completed; historical record kept as-is.)
- [x] `localhost:3000` renders without console errors.
- [x] `pnpm-lock.yaml` committed; `node_modules`/`dist`/`.next`/`.turbo` gitignored.
- [x] Both apps' `tsconfig.json` extend `@repo/typescript-config`; no duplicated compiler options.

## Risk Assessment

| #   | Risk                                                                                     | Likelihood | Impact | Mitigation                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | React 19 peer-dep conflicts with older libs                                              | Med        | Med    | `.npmrc` `strict-peer-dependencies=false`; pin `next` to a version with React 19 support                                                        |
| R2  | ESLint 9 flat config incompatible with a plugin                                          | Med        | Low    | Keep config minimal; if a plugin breaks, drop it — lint is advisory not blocking                                                                |
| R3  | `openapi.json` gitignored → fresh clone can't run `pnpm --filter=web codegen` standalone | Med        | Med    | Documented in README: run `pnpm codegen` (which regenerates it first). If CI needs it without a DB, un-ignore and commit `openapi.json` instead |
| R4  | Turbo caches a stale `codegen` output                                                    | Low        | Med    | `codegen` chain is a plain pnpm sequence, bypassing turbo cache; also `--force` documented                                                      |
| R5  | Port 3000/3001 already occupied on dev machine                                           | Low        | Low    | Ports read from `PORT` env; documented in `.env.example`                                                                                        |

**Rollback:** phase is additive to an empty repo — `git reset --hard cad566e` restores the initial commit.

## Security Considerations

- `.env` / `.env.local` gitignored from the start; only `.env.example` with placeholder values committed.
- No secrets in `turbo.json` / `package.json`.
- `.env.example` documents `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL` as placeholders only. `DATABASE_URL` points at the Docker Compose Postgres created in Phase 2.

## Next Steps

Unblocks Phase 2 (backend foundation) and Phase 3 (frontend foundation) — these can run in parallel; file ownership is disjoint.
