---
phase: 5
title: 'Harness Proof + README'
status: completed
priority: P1
effort: 1h
dependencies: [4]
---

# Phase 5: Harness Proof + README

## Context Links

- `CLAUDE.md` → Development Commands (test scripts)
- `.agent/projectRules/backend-architecture.md` → the source material for the module-authoring doc
- Depends on: Phase 4.

## Overview

**Priority:** P1 | **Status:** Pending | **Effort:** ~1h

Two deliverables:

1. **Two tests total. One per side. Neither asserts behavior.** They prove the Jest harness runs.
2. **The documentation** — root `README.md` plus `apps/api/src/modules/README.md`. This is the genuinely valuable part, and it grew this revision: with the example module deleted, the "how to add your first real module" guidance has nowhere to live except prose.

### Why the test suite is cut to almost nothing (stated explicitly)

A test suite adds essentially **zero value at stub-level**:

- Every service method is a stub. A test asserting `login()` returns `'stub-token'` asserts the _stub_, not the system. It passes today and must be **deleted** the moment someone implements the real method — negative value.
- V2's test matrix targeted `hasPermission`, both guards, and the services. All are now stubs returning constants. Testing them is testing `return true`.
- The security invariants such tests would protect (ADMIN wildcard, `@Public()` handling, no password in responses) **do not exist yet**. There is nothing to protect.

So the matrix collapses to the only thing still worth proving: **the Jest harness itself runs on both sides.** If a future developer writes a real test, does the runner execute it? That needs exactly one test per side.

**Deliberately excluded:** behavior tests, guard tests, service tests, hook tests, e2e, coverage thresholds, CI pipeline, component render tests, test database, codegen round-trip test (the codegen _run_ in Phases 3/4 already proves the pipeline; automating a round-trip check is CI work, deferred).

### Why "how to add a module" is a doc, not code

V3 shipped a stubbed `CoursesModule` as the copy-me example. The user cut it: with only `User`/auth in scope there is no second module, and a dead example module that nothing imports rots — it drifts from conventions, gets half-updated, and confuses newcomers about whether `Course` is real product scope.

**Replacement:** `apps/api/src/modules/README.md` describes the module shape as prose + one short illustrative snippet. Documentation is honest about being documentation. The `auth`/`users` modules remain as _live_ reference — they are real files that actually boot, which is a better example than a fake one.

## Stub vs Real — this phase

| Piece                                                                 | Verdict                          | Reason                                                                                                                            |
| --------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/jest.config.js`, `apps/web/jest.config.js`, `jest.setup.ts` | **REAL**                         | Config; the harness must actually run                                                                                             |
| The two tests themselves                                              | **REAL tests of trivial things** | They assert a stub returns its stub value, or that a pure schema rejects bad input. Real assertions, deliberately trivial targets |
| Root `README.md`                                                      | **REAL**                         | Highest-value artifact of the phase                                                                                               |
| `apps/api/src/modules/README.md`                                      | **REAL**                         | Replaces the deleted example module                                                                                               |
| Behavior tests of any kind                                            | **CUT**                          | Would test stubs                                                                                                                  |

## Requirements

**Functional**

- `pnpm test` runs both suites from the root and exits 0.
- Backend: exactly one spec. Frontend: exactly one spec.
- Root `README.md` gets a fresh clone to a booting app.
- `apps/api/src/modules/README.md` explains adding a domain module without pointing at an example module.

**Non-functional**

- No test hits a real network or DB.
- No test asserts business behavior (there is none).

## Architecture

```
apps/api/
├── jest.config.js                             # ts-jest, roots: src
├── src/modules/auth/auth.service.spec.ts      # the one backend spec
└── src/modules/README.md                      # how to add a module (prose)

apps/web/
├── jest.config.js                             # next/jest, testEnvironment: jsdom
├── jest.setup.ts
└── lib/auth/auth-schemas.spec.ts              # the one frontend spec

README.md                                      # root: setup, stub checklist, warnings
```

**Test matrix (complete — two rows, nothing beyond this)**

| Target                | Type                  | Assertion                                                | What it proves                                                                                    |
| --------------------- | --------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AuthService.login()` | unit, no mocks needed | resolves to `{ accessToken: 'stub-token', user: {...} }` | ts-jest + NestJS decorator/metadata compilation works; a future dev can write a real service test |
| `loginSchema` (zod)   | pure                  | rejects a bad email, accepts valid input                 | `next/jest` + jsdom + the `@/` alias all resolve; a future dev can write a real frontend test     |

The backend spec instantiates `AuthService` directly with `null` dependencies (`new AuthService(null as never, null as never)`) — no `Test.createTestingModule`, no Prisma mock, because the stub body touches neither. If that is awkward, a minimal `Test.createTestingModule` with `{ provide: UsersService, useValue: {} }` is equally acceptable; the point is only that Jest compiles and runs a decorated Nest class.

> Backend spec target changed from V3 (`CoursesService.findAll`) because that class no longer exists. `AuthService.login` is the equivalent stub on the only module that remains.

## Related Code Files

**Create:** `apps/api/jest.config.js`, `apps/api/src/modules/auth/auth.service.spec.ts`, `apps/api/src/modules/README.md`, `apps/web/jest.config.js`, `apps/web/jest.setup.ts`, `apps/web/lib/auth/auth-schemas.spec.ts`, root `README.md`.

**Modify:** `apps/api/package.json` / `apps/web/package.json` (test scripts).

**Not created (cut):** `apps/api/test/mocks/prisma.mock.ts`, all guard/service/hook specs.

## Implementation Steps

1. **Backend Jest config.** `apps/api/jest.config.js`: preset `ts-jest`, `rootDir: src`, `testRegex: '.*\\.spec\\.ts$'`, `moduleFileExtensions: ['js','json','ts']`. Script: `"test": "jest"`.

2. **The one backend spec.** `auth.service.spec.ts`:

   ```typescript
   // HARNESS PROOF ONLY. This asserts a stub returns its stub value. It proves the
   // test runner compiles and executes a decorated Nest service, nothing more.
   // Delete or replace it the moment login() is implemented.
   describe('AuthService (harness proof)', () => {
     it('runs the Jest harness against a decorated Nest service', async () => {
       const service = new AuthService(null as never, null as never);
       await expect(
         service.login({ email: 'a@b.co', password: 'password' } as never),
       ).resolves.toMatchObject({ accessToken: 'stub-token' });
     });
   });
   ```

3. **Frontend Jest config.** `next/jest` with `testEnvironment: 'jsdom'`, `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`, `moduleNameMapper` for the `@/` alias. **Exclude `lib/api/generated/**` from test discovery.**

4. **The one frontend spec.** `auth-schemas.spec.ts`: `expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false)` plus a valid-input case. This targets a zod schema — one of the few genuinely real (declarative) pieces of frontend code in the plan — so the assertion is meaningful rather than circular. Same "harness proof" header comment.

5. **`apps/api/src/modules/README.md` — the module-authoring doc** (replaces V3's example module). Cover, briefly:
   - **Module shape:** `modules/{name}/{name}.module.ts`, `.controller.ts`, `.service.ts`, `dto/`. Point at the **live** `auth/` and `users/` modules as the working reference — they boot, so they cannot silently rot the way a fake example would.
   - **Steps to add one:** add the model to `prisma/schema.prisma` → `prisma migrate dev` → create the module folder → register it in `app.module.ts` → `pnpm codegen` → consume the generated hook on the frontend.
   - **Controller stays thin**; business logic goes in the service.
   - **Split into `services/{name}-read|-workflow|-shared.service.ts` only** when the service passes 500 lines or 6 injected deps — a threshold, not a default. State this explicitly or every future module gets pre-split for no reason.
   - **Never query another module's table via `PrismaService`** — import that module and inject its exported Service. (This is the rule the deleted Course example existed to demonstrate; it now has to be stated clearly instead of shown.)
   - **Every endpoint gets an explicit `operationId`** prefixed with the domain — it becomes the frontend hook name, and collisions silently overwrite hooks.
   - **Every response gets an envelope DTO.** Include the 4-line snippet:
     ```typescript
     export class ThingResponseDto extends ApiResponseDto {
       @ApiProperty({ type: ThingDto })
       declare data: ThingDto;
     }
     ```
     Explain why: `TransformInterceptor` wraps everything in `{ statusCode, data }`, so documenting the bare DTO would make every generated frontend type wrong. Services return the **inner** shape only — never pre-wrapped, or it double-wraps.
   - **Envelope upgrade trigger:** if wrapper classes ever multiply uncomfortably (many endpoints, or a shared paginated `{ data: T[], meta }`), switch to the generic `ApiResponseDto<T>` + `@ApiExtraModels` + `getSchemaPath()` + `allOf` decorator pattern. Note that it produces inline schemas, so verify Orval's output naming when making that switch.
   - **A "what is still stubbed" section:** every service body, both guards, `JwtStrategy.validate()`, `hasPermission()`, the frontend action hook. Note that ownership checks (owner-or-ADMIN) belong in the _service_ after loading the row, not in a guard — the guard cannot see the row.
   - After changing a DTO or endpoint: `pnpm codegen`, then consume the generated hook — never hand-write a client.

6. **Root `README.md`** — the primary deliverable. Must contain:
   - **A prominent warning at the top:** _This is a structural skeleton. Every service method, both auth guards, `JwtStrategy.validate()`, and the frontend action hook are stubs. The API has NO authentication and NO authorization. Do not deploy this anywhere._
   - **What this base contains:** a `User` table, a stubbed JWT/access-control layer, an envelope-typed contract pipeline, and a single login page. **State plainly that there is no domain module** — adding the first one is the reader's job, per `apps/api/src/modules/README.md`.
   - Prereqs: Node >= 18, pnpm, **Docker**.
   - Setup order: `pnpm install` → copy `.env.example` → `docker compose up -d` → `pnpm --filter=api prisma:migrate` → `pnpm codegen` → `pnpm dev`.
   - Ports (web 3000, api 3001), Swagger at `localhost:3001/api`.
   - **"What is stubbed" checklist** — the single most useful section. Enumerate: all `UsersService` methods, all `AuthService` methods, `JwtAuthGuard.canActivate`, `PermissionsGuard.canActivate`, `JwtStrategy.validate`, `hasPermission`, and `useAuthActions().login`. State that **logging in appears to succeed and does nothing** — no token is stored, no redirect happens — so nobody files it as a bug.
   - **The one architectural decision worth carrying forward:** responses are enveloped as `{ statusCode, data }`, documented via envelope DTO classes, and the frontend mutator does **not** unwrap. Call sites read `res.data`. (V3 left this as an open question; it is now decided and implemented — the README records the decision, not a TODO.)
   - The two template rules: never edit `lib/api/generated/` (change the backend DTO and re-run `pnpm codegen`); add a backend module per `apps/api/src/modules/README.md`.

7. **Full-stack boot verification** (the plan-level success criteria, executed and recorded):
   1. Fresh clone simulation: `pnpm install` → `docker compose up -d` → `prisma migrate dev`.
   2. `pnpm build` exits 0.
   3. `pnpm dev` → both apps boot, no runtime error.
   4. `localhost:3001/api` → Swagger lists `authLogin` + `authGetMe` with envelope-wrapped schemas.
   5. `pnpm codegen` → succeeds; `useAuthLogin` + `useAuthGetMe` present with envelope response types.
   6. `localhost:3000/login` → renders; submitting fires a real `POST /auth/login`.
   7. `pnpm test` → both suites pass.
   8. `pnpm lint` + `pnpm check-types` → exit 0.

## Todo List

- [x] `apps/api/jest.config.js` + test script
- [x] `auth.service.spec.ts` (harness proof, with the "delete me later" header comment)
- [x] `apps/web/jest.config.js` + `jest.setup.ts`
- [x] `auth-schemas.spec.ts` (harness proof)
- [x] `apps/api/src/modules/README.md` — module shape, boundary rule, envelope snippet, upgrade trigger
- [x] Root `README.md` — warning, setup, stub checklist, envelope decision
- [x] 8-step boot verification recorded

## Success Criteria

- [x] `pnpm test` from root runs both suites, exits 0, no skipped/`.only` tests.
- [x] Exactly two spec files exist in the repo.
- [x] Both specs carry a header comment stating they prove the harness, not behavior.
- [x] Root `README.md` contains the do-not-deploy warning, the "what is stubbed" checklist, the "login does nothing" note, and the envelope decision.
- [x] Root `README.md` states there is **no domain module** and points at `modules/README.md` for adding one.
- [x] `apps/api/src/modules/README.md` exists, explains the module shape **without referencing a scaffolded example module**, and includes the envelope DTO snippet.
- [x] All 8 boot-verification steps pass and are recorded.
- [x] `pnpm build`, `pnpm lint`, `pnpm check-types` all exit 0 from root.
- [x] A fresh clone can reach a booting app using only the README. (Code review initially caught a `.gitignore` bug that silently dropped `.env.example` and `apps/web/.env.local.example` from git tracking, which would have broken this exact criterion — fixed and re-verified with `git check-ignore`.)
- [x] Repo-wide grep for `Course` / `course` returns zero hits.

## Risk Assessment

| #   | Risk                                                                                                                                      | Likelihood | Impact   | Mitigation                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Implementer rebuilds a full test matrix, testing stubs                                                                                    | **High**   | Med      | Matrix closed at two rows; success criterion asserts exactly two spec files exist                                                                              |
| R2  | `next/jest` + React 19 + jsdom config friction eats the budget                                                                            | Med        | Med      | The frontend spec targets a pure zod schema — no rendering, no React. If jsdom still fights, switch `testEnvironment` to `node` for that spec; it needs no DOM |
| R3  | ts-jest decorator/metadata errors on the NestJS spec                                                                                      | Med        | Med      | Ensure `emitDecoratorMetadata` in the `nestjs.json` tsconfig; this is precisely the failure the harness proof surfaces early                                   |
| R4  | Harness-proof tests survive into real development and rot                                                                                 | Med        | Low      | Header comments instruct deletion/replacement on implementation                                                                                                |
| R5  | **`modules/README.md` written as vague prose** because there is no example module to point at, leaving the module shape genuinely unclear | Med        | **High** | Step 5 enumerates required sections; the envelope snippet is mandatory; it must point at the live `auth`/`users` modules as the concrete reference             |
| R6  | Reader assumes the skeleton is more complete than it is and ships it                                                                      | Med        | **High** | Do-not-deploy warning is the top line of the README; stub checklist is explicit; "login does nothing" stated outright                                          |
| R7  | Boot verification skipped under time pressure                                                                                             | Med        | **High** | It is the plan-level definition of done, recorded step by step                                                                                                 |

**Rollback:** tests and docs are additive — deleting them never breaks the app.

## Security Considerations

- The README's do-not-deploy warning is the **primary security control of this entire plan.** The skeleton has no authentication and no authorization; the only thing preventing harm is that whoever picks it up knows that.
- The "what is stubbed" checklist must name every open guard explicitly, so nobody assumes `APP_GUARD` registration implies enforcement.
- No real secrets in configs or fixtures — `.env.example` uses an obviously-fake placeholder.
- No test asserts a security invariant, because none are implemented yet. That gap is itemized in the README so it cannot be missed.

## Next Steps

Base skeleton complete. The repo compiles, boots, serves Swagger, generates an envelope-typed client, renders a login page that reaches the API, and runs tests. **No feature works.**

Whoever builds the product: start from the README's "what is stubbed" checklist, implement `AuthService` + the guards first (everything else depends on real auth), then add the first domain module per `apps/api/src/modules/README.md`.
