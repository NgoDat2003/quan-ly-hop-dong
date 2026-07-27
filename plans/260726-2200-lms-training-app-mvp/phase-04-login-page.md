---
phase: 4
title: 'Login Page'
status: completed
priority: P1
effort: 1h
dependencies: [2, 3]
---

# Phase 4: Login Page

## Context Links

- `.agent/projectRules/frontend-architecture.md` → render-only components, action-hook split, 300-line cap
- `CLAUDE.md` → Form Pattern (react-hook-form + zod + shadcn Form)
- Depends on: Phase 2 (endpoints) + Phase 3 (generated client). Blocks: Phase 5.

## Overview

**Priority:** P1 | **Status:** Pending | **Effort:** ~1h

**One screen: `/login`.** That is the entire frontend feature surface of this base.

It exists to prove one thing that no amount of config can prove on its own: **the full vertical slice is wired.** Page → render-only form component → action hook → Orval-generated mutation → custom mutator → running NestJS endpoint → envelope response. If a login submit produces a real `POST /auth/login` in the Network tab, every layer built in Phases 1–3 is connected.

**The page renders and the files are correctly split, but login does not work.** Submitting fires the real generated mutation and does nothing with the result — no token persisted, no redirect, no toast, no cache invalidation.

### Why the mandatory split applies to a single screen

`.agent/projectRules/frontend-architecture.md` requires side-effects to live in `features/{feature}/hooks/use-{feature}-actions.ts`, never in components. That rule is **not** waived because there is only one form. This login page is the sole worked example of the convention in the repo — it is what every future feature will be copied from. A shortcut here (mutation called directly in the form) propagates into every feature anyone writes afterwards. The split costs one extra 20-line file.

## Stub vs Real — this phase

| Piece                                                                  | Verdict  | Reason                                                                                                             |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| File paths and the render/action split                                 | **REAL** | This IS the deliverable                                                                                            |
| `login/page.tsx` (render-only, wires hook → form)                      | **REAL** | Markup is structure                                                                                                |
| `login-form.tsx` (`react-hook-form` + `zodResolver` + shadcn `<Form>`) | **REAL** | The form wiring pattern is what gets copied. Props: `onSubmit`, `isPending`                                        |
| `lib/auth/auth-schemas.ts` zod schema                                  | **REAL** | Declarative shape, same category as DTO decorators. Small, directly useful, and Phase 5's frontend test targets it |
| Calling the generated Orval hook from the action hook                  | **REAL** | Cheap, and it proves the whole pipeline. This is the point of the phase                                            |
| **Action-hook body** (what happens after `mutateAsync`)                | **STUB** | `setToken` / toast / invalidate / redirect are all behavior                                                        |
| **Error handling / field-level API errors**                            | **STUB** | Behavior                                                                                                           |
| `register` / `logout` actions                                          | **CUT**  | No register page; nothing to log out of                                                                            |

> **On calling the real hook:** calling the generated hook costs the same as faking it and proves considerably more — that the mutator, base URL, generated hook name, envelope type, and route wiring all line up. So: **call the real hook, discard the result.** The stub is in what happens _after_ the call, not in whether the call happens.

## Key Insights

- **This login will "succeed" against a stub backend and still do nothing.** `POST /auth/login` returns `{ statusCode: 200, data: { accessToken: 'stub-token', user: {...} } }` — a 2xx. The mutation resolves, the action hook's TODO body ignores it, and the user stays on `/login`. That is a **pass**, not a bug. Anyone reviewing this expecting to land on a dashboard has misread the scope (there is no dashboard).
- **The action hook reads `res.data.accessToken`, not `res.accessToken`** — when it is implemented. Phase 2 documents the envelope and Phase 3's mutator does not unwrap, so the generated type has `data` at the top. Write that into the TODO comment explicitly; it is the single most likely mistake whoever implements this will make, and the type system will catch it only if they read the error.
- **Send only what `LoginDto` declares.** `forbidNonWhitelisted` is real and active, so an extra field is a 400 even against a stub endpoint. The zod schema and the DTO must agree on exactly `{ email, password }`.
- **Zod schema mirrors the backend DTO's rules** (`email` valid, `password` min 8) so client and server reject the same inputs. Keep them in sync by hand — this base does not generate zod from OpenAPI, and doing so is out of scope.
- **No state library.** Local `useState` + React Query cache. Do not introduce Zustand for one form (YAGNI).

## Requirements

**Functional**

- `/login` renders an email + password form.
- `features/auth/hooks/use-auth-actions.ts` exists and owns every side-effect entry point (stub body).
- Form uses react-hook-form + zodResolver + shadcn `<Form>`.
- Submitting fires a real `POST /auth/login` through the generated hook.

**Non-functional**

- Zero hand-written DTO types — all from `lib/api/generated/model`.
- Every file < 300 lines.
- No component calls `mutateAsync` directly.
- Every stub body carries `// TODO: implement`.

## Architecture

```
apps/web/
├── app/(auth)/login/page.tsx          # render-only; wires hook → form
├── features/auth/
│   ├── components/login-form.tsx      # pure UI; props: onSubmit, isPending
│   └── hooks/use-auth-actions.ts      # ALL side-effects (stub bodies)
└── lib/auth/auth-schemas.ts           # zod loginSchema (pure, testable)
```

**Side-effect flow — the reusable shape being demonstrated (body stubbed):**

```
login-form onSubmit  →  useAuthActions().login(dto)     [component's job ends here]
                          → useAuthLogin().mutateAsync   [REAL call]
                          → // TODO: setToken(res.data.accessToken) + toast + router.push
```

**Full vertical slice this phase proves:**

```
page → form → action hook → generated useAuthLogin → customFetch → POST localhost:3001/auth/login
     → TransformInterceptor → { statusCode, data } → typed as the envelope model
```

## Related Code Files

**Create:** `apps/web/app/(auth)/login/page.tsx`, `apps/web/features/auth/components/login-form.tsx`, `apps/web/features/auth/hooks/use-auth-actions.ts`, `apps/web/lib/auth/auth-schemas.ts`.

**Read-only:** `apps/web/lib/api/generated/**` — import only, never edit.

**Not created (cut vs V3):** register page/form, any course page, `course-columns.ts`, `lib/courses/**`, `features/courses/**`.

## Implementation Steps

1. **Re-run codegen first.** `pnpm codegen` from repo root, then confirm `useAuthLogin` and `useAuthGetMe` exist in `lib/api/generated/`. A missing hook = a backend `@ApiOperation` gap; fix it in `apps/api` and re-run — **never** by hand-writing a client.

2. **`lib/auth/auth-schemas.ts` — REAL.**

   ```typescript
   import { z } from 'zod';

   // Mirrors LoginDto on the backend (email @IsEmail, password @MinLength(8)).
   // Keep in sync by hand — this base does not generate zod from OpenAPI.
   export const loginSchema = z.object({
     email: z.string().email('Email không hợp lệ'),
     password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
   });

   export type LoginFormValues = z.infer<typeof loginSchema>;
   ```

   No `role` field, no extra fields — `forbidNonWhitelisted` would 400 them.

3. **`features/auth/hooks/use-auth-actions.ts` — real hook call, STUB body.**

   ```typescript
   export function useAuthActions() {
     const loginMutation = useAuthLogin();

     const login = async (dto: LoginFormValues) => {
       // TODO: implement — on success:
       //   setToken(res.data.accessToken)   <-- NOTE: res.data, not res.
       //     The API documents an envelope ({ statusCode, data }) and the mutator
       //     does not unwrap, so the token is one level down.
       //   then queryClient.invalidateQueries(), toast.success, router.push('/').
       // On failure: toast.error(err.message).
       // The catch exists only to keep the console clean while the backend is stubbed.
       try {
         await loginMutation.mutateAsync({ data: dto });
       } catch {
         // TODO: surface the error to the user
       }
     };

     return { login, isPending: loginMutation.isPending };
   }
   ```

   No `register`, no `logout` — nothing consumes them.

4. **`features/auth/components/login-form.tsx` — REAL.** shadcn `<Form>` + `zodResolver(loginSchema)`, receiving `onSubmit` and `isPending` as props. The form contains **no** `toast`, **no** `router`, **no** mutation call — it is pure UI. Submit button disabled while `isPending`.

5. **`app/(auth)/login/page.tsx` — REAL, render-only.**

   ```tsx
   'use client';

   export default function LoginPage() {
     const { login, isPending } = useAuthActions();
     return <LoginForm onSubmit={login} isPending={isPending} />;
   }
   ```

   That is the whole page. If it grows logic, the logic belongs in the action hook.

6. **Verify the vertical slice.** Boot both apps. Open `/login`, submit a valid email + 8-char password, and watch the Network tab: a real `POST http://localhost:3001/auth/login` with a JSON body, returning `{ statusCode: 200, data: {...} }`. Then submit `a@b` / `123` and confirm the form blocks it client-side via zod without any request firing.

## Todo List

- [x] `pnpm codegen` + confirm `useAuthLogin` present
- [x] `lib/auth/auth-schemas.ts` (real zod schema)
- [x] `use-auth-actions.ts` (real hook call, stub body, envelope-aware TODO)
- [x] `login-form.tsx` (real, render-only, props-driven)
- [x] `login/page.tsx` (render-only)
- [x] Vertical-slice verification via Network tab
- [x] Client-side zod validation blocks bad input without a request

## Success Criteria

**Structural only — no behavioral assertions.**

- [x] `/login` renders without a runtime error.
- [x] Submitting a valid form fires a real `POST /auth/login`, visible in the Network tab, returning 200 with an envelope body — **this is the plan's proof that every layer is connected.** Verified live via `agent-browser`: real request/response captured, body `{"email":"test@example.com","password":"password123"}` → 200.
- [x] Submitting an invalid email or a 3-char password shows a field error and fires **no** request (zod resolver active). Verified live: zero requests captured, field errors "Email không hợp lệ" / "Mật khẩu tối thiểu 8 ký tự" rendered.
- [x] No component or `page.tsx` calls `mutateAsync` directly (grep `mutateAsync` outside `features/**/hooks/`).
- [x] No `toast.` / `router.push` / `invalidateQueries` inside `components/` or `page.tsx`.
- [x] `features/auth/hooks/use-auth-actions.ts` exists and is the only file with a side-effect entry point.
- [x] No hand-written request/response types (grep `interface .*Dto` outside `lib/api/generated/`).
- [x] No file > 300 lines.
- [x] Every stub body carries `// TODO: implement`.
- [x] `pnpm --filter=web build`, `check-types`, `lint` exit 0.
- [x] Exactly one page route exists under `app/(auth)/` — grep confirms no register/course/dashboard route anywhere.

## Risk Assessment

| #   | Risk                                                                                                                                     | Likelihood | Impact   | Mitigation                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Stub side-effects written directly in the form — the convention this phase exists to demonstrate is violated in the demonstration itself | **High**   | **High** | Greppable structural criteria; the split applies to stubs exactly as to real code. This is the repo's only worked example, so a bad one propagates everywhere |
| R2  | Implementer fills in real `setToken`/redirect/toast logic — the V2/V3 scope error again                                                  | **High**   | Med      | Stub table at top; success criteria assert no behavior; `// TODO` markers required                                                                            |
| R3  | Implementer writes `res.accessToken` instead of `res.data.accessToken` when implementing later                                           | **High**   | Low      | Called out in Key Insights and inline in the TODO. `tsc` catches it, but only if the message is read                                                          |
| R4  | "Login does nothing" reported as a bug                                                                                                   | Med        | Low      | Called out in Key Insights and in the README's stub checklist (Phase 5)                                                                                       |
| R5  | Unhandled promise rejection noise mistaken for a broken build                                                                            | Med        | Low      | `try/catch` in the stub action body (step 3), with a TODO noting why                                                                                          |
| R6  | Generated hook missing because Phase 3 codegen was skipped                                                                               | Med        | Med      | Step 1 re-runs `pnpm codegen` before anything else                                                                                                            |
| R7  | Hydration mismatch from reading `localStorage` during render                                                                             | Low        | Med      | The login page reads no token; `getToken()` SSR guard from Phase 3 covers the mutator                                                                         |

**Rollback:** the feature folder is additive and self-contained; revert the commit without touching foundation code.

## Security Considerations

Nothing in this phase is a security boundary, and — unlike a normal build — neither is the backend it talks to (Phase 2 guards are stubs).

- The form declares no role field and sends exactly `{ email, password }`; preserves the convention for whoever implements real login.
- Token **write** will belong in `use-auth-actions.ts` (stubbed); token **read** is confined to `auth-token.ts`. That structural decision is preserved even though the write does not happen yet.
- No `dangerouslySetInnerHTML` anywhere.
- Password field must be `type="password"` and must never be logged, echoed into a toast, or persisted — worth getting right even in a stub, because it is copied.
- Client-side validation is UX only. Real enforcement is the backend's `ValidationPipe`, which **is** real here.

## Next Steps

Unblocks Phase 5 (harness proof + README). The vertical slice is now provable end to end.
