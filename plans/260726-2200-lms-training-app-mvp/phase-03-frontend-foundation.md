---
phase: 3
title: 'Frontend Foundation'
status: completed
priority: P1
effort: 3h
dependencies: [1]
---

# Phase 3: Frontend Foundation

## Context Links

- [Frontend stack report §2–§4](./research/researcher-01-frontend-stack-report.md)
- `.agent/projectRules/frontend-architecture.md` → API contract layer, component rules
- Depends on: Phase 1 (scaffold). **The codegen step (7) additionally depends on Phase 2** — it needs a populated `openapi.json`. Blocks: Phase 4.

## Overview

**Priority:** P1 | **Status:** Pending | **Effort:** ~3h

The **frontend infrastructure layer** — Tailwind + shadcn/ui, TanStack Query provider, Orval config + custom fetch mutator, auth-token storage, and the `(auth)` layout shell. No screens — the one screen (`/login`) is Phase 4.

### Scope trim vs V3

V3's version of this phase built an `(app)` route group with nav chrome, a role-filtered `<AppNav />`, a `<UserMenu />`, and an auth-redirect guard — all to host course screens. **Those are gone.** With `/login` as the only route, there is no authenticated area to navigate, so there is no nav to build. Only the `(auth)` layout survives. That is the −0.5h.

### Stub vs Real in this phase

**Almost everything here is real**, which is the plan's stub rule applied rather than an exception to it. This phase contains no business logic to defer — it is config, a fetch mutator, a QueryClient factory, and one layout shell. Each piece either works or the frontend doesn't build.

| Piece                                                 | Verdict  | Reason                                                                                                                                                        |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind + shadcn init, `components.json`, path alias | **REAL** | Config; nothing to stub                                                                                                                                       |
| `http-client.ts` mutator (incl. envelope unwrap)      | **REAL** | Orval-generated hooks import it by path; a stub breaks every generated call site and `tsc`                                                                    |
| `orval.config.ts` + codegen run                       | **REAL** | Producing real typed hooks is a plan-level success criterion                                                                                                  |
| `query-client.ts`, `providers.tsx`                    | **REAL** | ~15 lines of framework wiring                                                                                                                                 |
| `auth-token.ts` (`get`/`set`/`clearToken`)            | **REAL** | Three `localStorage` calls; stubbing costs more than writing                                                                                                  |
| `(auth)/layout.tsx` centered shell                    | **REAL** | Pure markup                                                                                                                                                   |
| `use-session.ts`                                      | **CUT**  | It existed to drive nav/redirect logic that no longer exists. `/login` is a public page and reads no session. Whoever adds an authenticated area adds it then |
| `(app)` layout, `app-nav.tsx`, `user-menu.tsx`        | **CUT**  | No authenticated area exists                                                                                                                                  |

The mutator deserves emphasis: it is the one file where writing a stub would actively cost more work than writing it properly, because every generated hook calls it.

## Key Insights

- **The envelope is now decided, so the mutator unwraps — deterministically.** Phase 2 documents responses as `{ statusCode, data }` envelope classes, matching what `TransformInterceptor` actually emits. So the _generated type_ is the envelope type, and the mutator returns the body **untouched**. This is the resolution of V3's dangling "unwrap here or add DTOs on the backend?" TODO: **the backend added the DTOs, so the frontend does nothing.** No unwrapping, no `body.data`, no type assertion. Generated types and the wire agree, and callers read `res.data`. Do not add an unwrap step "to make it nicer" — that would silently re-break the type/wire agreement in the opposite direction.
- **Do not run `shadcn init --monorepo`.** That flag scaffolds its own `apps/web` + `packages/ui` layout and would collide with the Phase-1 structure. Run plain `pnpm dlx shadcn@latest init` **from inside `apps/web`**; components land in `apps/web/components/ui/`. A shared `packages/ui` is deferred (only one consuming app — YAGNI).
- **The research report's `customFetch` mutator is incomplete — do not copy it verbatim.** Two concrete defects, both fixed in step 5: it drops `config.params` (every filtered GET silently ignores its query string), and it calls `response.json()` unconditionally (throws on 204). Neither bites the two current endpoints, but the mutator is copied forever after — fix it now.
- **Orval input path.** Config lives at `apps/web/orval.config.ts`; input target `../api/openapi.json` resolves relative to the config file. Confirm after the first run — a wrong path yields a confusing "no schema" error.
- **TanStack Query `staleTime` defaults to 0**, causing an immediate refetch after hydration. Set `staleTime: 60_000`, `gcTime: 300_000`.
- **QueryClient must be per-request on the server** and stable across re-renders on the client. Use the standard `isServer ? makeQueryClient() : (browserQueryClient ??= makeQueryClient())` pattern. A module-level singleton leaks one user's cache into another's SSR render.
- **Token in `localStorage`** is the base-template choice (matches the research mutator). It is XSS-readable; accepted here and noted in Security — swap to httpOnly cookies if a clone needs it.
- **Only two shadcn components are strictly needed** (`button`, `input`, `label`, `card`, `form`, `sonner`) — the V3 set included `table`, `dialog`, `textarea`, `badge`, `skeleton`, `dropdown-menu` for course screens that no longer exist. Install the small set; adding more later is one CLI command.

## Requirements

**Functional**

- Tailwind CSS operational; shadcn/ui components installable and rendering.
- `QueryClientProvider` + Devtools (dev only) + `<Toaster />` wrapping the app.
- `pnpm codegen` regenerates `apps/web/lib/api/generated/**` from the backend contract.
- Generated hooks send `Authorization: Bearer <token>` automatically.
- Token helpers: `getToken`/`setToken`/`clearToken`.
- `(auth)` route group with a centered card layout.

**Non-functional**

- `lib/api/generated/` is **committed** to git (resolved decision); never hand-edited.
- All files < 300 lines.
- Base URL from `NEXT_PUBLIC_API_URL`, defined in exactly one place.

## Architecture

```
apps/web/
├── orval.config.ts
├── components.json                # shadcn config
├── tailwind.config.ts             # only if Tailwind v3; v4 uses CSS-first
├── app/
│   ├── layout.tsx                 # html/body + <Providers>
│   ├── globals.css                # tailwind directives + shadcn tokens
│   ├── providers.tsx              # 'use client' — QueryClientProvider + Toaster
│   └── (auth)/layout.tsx          # centered card shell
├── components/ui/                 # shadcn CLI output
└── lib/
    ├── api/
    │   ├── generated/             # ORVAL OUTPUT — never hand-edit
    │   └── http-client.ts         # the ONLY fetch layer
    ├── auth/auth-token.ts         # localStorage helpers
    └── query-client.ts            # makeQueryClient factory
```

**Contract flow:**

```
apps/api DTO + envelope DTO + @ApiOperation(operationId)
  → pnpm --filter=api openapi:generate → apps/api/openapi.json
  → pnpm --filter=web codegen (orval)  → apps/web/lib/api/generated/{tag}.ts + model/
  → feature action hooks import generated hooks (Phase 4)
```

**Request flow:** generated hook → `customFetch` (adds base URL, `Authorization`, JSON headers, query string) → API → non-2xx throws `ApiError` → TanStack Query `onError` → toast in the feature's action hook (never in a component). Successful bodies pass through **unmodified** as the envelope type.

## Related Code Files

**Create:** `apps/web/orval.config.ts`, `apps/web/components.json`, `apps/web/app/providers.tsx`, `apps/web/app/(auth)/layout.tsx`, `apps/web/lib/api/http-client.ts`, `apps/web/lib/auth/auth-token.ts`, `apps/web/lib/query-client.ts`, `apps/web/.env.local.example`.

**Modify:** `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/package.json` (deps + `codegen` script), `apps/web/tsconfig.json` (`@/*` path alias), root `.gitignore`.

**Generated (never hand-edit):** `apps/web/lib/api/generated/**`.

**Not created (cut vs V3):** `lib/auth/use-session.ts`, `app/(app)/layout.tsx`, `components/layout/app-nav.tsx`, `components/layout/user-menu.tsx`.

## Implementation Steps

1. **Install deps.**
   `pnpm --filter=web add @tanstack/react-query react-hook-form @hookform/resolvers zod sonner clsx tailwind-merge lucide-react`
   `pnpm --filter=web add -D @tanstack/react-query-devtools orval tailwindcss @tailwindcss/postcss postcss`

2. **Tailwind.** Follow the version the CLI installs. Tailwind v4 → CSS-first: `@import "tailwindcss";` in `globals.css`, PostCSS plugin only, **no** `tailwind.config.ts`, and leave `components.json`'s `tailwind.config` empty per the research report. Tailwind v3 → classic `tailwind.config.ts` with `content` globs covering `app/**`, `components/**`, `features/**`. Verify by rendering one utility class before continuing.

3. **shadcn/ui init** — run from `apps/web`, no `--monorepo`:

   ```bash
   cd apps/web && pnpm dlx shadcn@latest init
   pnpm dlx shadcn@latest add button input label card form sonner
   ```

   That set covers the login form and nothing else, which is all this base ships. Add more on demand.

4. **`tsconfig.json`** `paths`: `{"@/*": ["./*"]}`.

5. **`lib/api/http-client.ts` — the corrected mutator.**

   ```typescript
   import { getToken } from '@/lib/auth/auth-token';

   export class ApiError extends Error {
     constructor(
       public status: number,
       message: string,
     ) {
       super(message);
       this.name = 'ApiError';
     }
   }

   const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

   export const customFetch = async <T>(config: {
     url: string;
     method: string;
     params?: Record<string, unknown>;
     data?: unknown;
     headers?: Record<string, string>;
     signal?: AbortSignal;
   }): Promise<T> => {
     const token = getToken();

     // FIX 1: serialize query params — the research sketch dropped them entirely
     const query = config.params
       ? Object.entries(config.params)
           .filter(([, v]) => v !== undefined && v !== null && v !== '')
           .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
           .join('&')
       : '';

     const response = await fetch(`${BASE_URL}${config.url}${query ? `?${query}` : ''}`, {
       method: config.method.toUpperCase(),
       headers: {
         'Content-Type': 'application/json',
         ...config.headers,
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: config.data !== undefined ? JSON.stringify(config.data) : undefined,
       signal: config.signal,
     });

     if (!response.ok) {
       const body = await response.json().catch(() => ({}));
       throw new ApiError(response.status, body.message ?? `HTTP ${response.status}`);
     }

     // FIX 2: 204 / empty body would crash response.json()
     if (response.status === 204 || response.headers.get('content-length') === '0') {
       return undefined as T;
     }

     // NO unwrapping — deliberate. The API documents its responses with envelope
     // DTOs ({ statusCode, data }), so the Orval-generated type IS the envelope
     // and already matches this body exactly. Unwrapping here would desync the
     // generated types from what callers actually receive. Read `res.data` at
     // the call site instead.
     return (await response.json()) as T;
   };

   export default customFetch;
   ```

6. **`lib/auth/auth-token.ts`.** `getToken()` returns `null` when `typeof window === 'undefined'` (SSR-safe). `setToken`, `clearToken`. Key constant `AUTH_TOKEN_KEY = 'app_auth_token'`.

7. **`orval.config.ts`** (run only after Phase 2 lands):

   ```typescript
   import { defineConfig } from 'orval';

   export default defineConfig({
     api: {
       input: { target: '../api/openapi.json' },
       output: {
         mode: 'tags-split',
         target: 'lib/api/generated',
         schemas: 'lib/api/generated/model',
         client: 'react-query',
         prettier: true,
         override: {
           mutator: { path: './lib/api/http-client.ts', name: 'customFetch' },
           query: { useQuery: true, signal: true },
         },
       },
     },
   });
   ```

   Add `"codegen": "orval --config orval.config.ts"` to `apps/web/package.json`.
   Then from repo root: `pnpm codegen` (chains api export → orval).

   **Inspect the output for the envelope.** `lib/api/generated/model/` must contain a named `AuthLoginResponseDto` (or Orval's cased equivalent) with a `data: AuthResultDto` field. If instead you see an anonymous inline type or a `...Response200` name, the backend documented an inline `allOf` schema rather than a concrete class — go fix Phase 2 step 5, do not paper over it here.

8. **`lib/query-client.ts`.**

   ```typescript
   import { QueryClient, isServer } from '@tanstack/react-query';

   function makeQueryClient() {
     return new QueryClient({
       defaultOptions: {
         queries: { staleTime: 60_000, gcTime: 300_000, retry: 1, refetchOnWindowFocus: false },
       },
     });
   }

   let browserQueryClient: QueryClient | undefined;

   export function getQueryClient() {
     if (isServer) return makeQueryClient(); // per-request → no cross-user cache leak
     return (browserQueryClient ??= makeQueryClient());
   }
   ```

9. **`app/providers.tsx`** — `'use client'`, wraps `QueryClientProvider` + `<Toaster />` (sonner) + Devtools when `NODE_ENV !== 'production'`. `app/layout.tsx` imports `globals.css` and renders `<Providers>`.

10. **`(auth)/layout.tsx`** — centered card shell. Pure markup, real, ~15 lines. This is the only layout beyond the root.

11. **Root page.** `app/page.tsx` (from Phase 1) stays a placeholder or redirects to `/login` — implementer's call, one line either way. Do not build a landing page.

12. **Env.** `.env.local.example` with `NEXT_PUBLIC_API_URL=http://localhost:3001`. Add `.env.local` to `.gitignore`.

13. **Generated-dir git policy (resolved): COMMIT `lib/api/generated/`.** A fresh clone then type-checks and builds without a running DB (codegen needs one). Confirm it is **not** in `.gitignore` (Phase 1 step 1 carries the same warning), and drop a short `lib/api/generated/README.md` stating: generated by Orval, never hand-edit, regenerate with `pnpm codegen` from the repo root.

14. **Verify.** `pnpm --filter=web build`, `check-types`, and a temporary scratch call to a generated hook against the running API.

## Todo List

- [x] Install FE deps
- [x] Tailwind operational (version-appropriate config)
- [x] `shadcn init` (no `--monorepo`) + add the component set
- [x] `@/*` path alias
- [x] `http-client.ts` with params + 204 fixes, envelope passed through unmodified
- [x] `auth-token.ts` (SSR-safe)
- [x] `orval.config.ts` + `codegen` script
- [x] `query-client.ts` (per-request on server)
- [x] `providers.tsx` + root layout wiring
- [x] `(auth)/layout.tsx` centered shell
- [x] `.env.local.example`
- [x] Generated-dir git policy confirmed + `generated/README.md`
- [x] **[after Phase 2]** `pnpm codegen` produces typed hooks with envelope types
- [x] `pnpm --filter=web build` + `check-types` green

## Success Criteria

Structural / build-level. The only "behavior" asserted is that the codegen pipeline works, which is a plan-level criterion.

- [x] A shadcn `<Button>` renders with Tailwind styles applied.
- [x] `pnpm codegen` from repo root regenerates `lib/api/generated/**` with zero manual edits.
- [x] Generated hook names match backend operationIds — **exactly two present**: `useAuthLogin`, `useAuthGetMe`. No others (health endpoint excluded via `@ApiExcludeEndpoint()` after code review caught it leaking a third hook).
- [x] Generated model types are concrete (no `unknown`/`any` on DTO fields) — proves the Phase 2 DTOs were declared as classes with `@ApiProperty`.
- [x] **The generated login response type is the envelope** — a named type with `statusCode` and `data: AuthResultDto`, not a bare `AuthResultDto`. This is the observable proof that the Phase 2 envelope work landed correctly.
- [x] `http-client.ts` does **not** unwrap the API's own envelope `data` (grep confirms no `.data.data` collapsing in the mutator's return path). Note: the installed Orval 8.23.0 uses a fetch-client contract, not the plan's assumed config-object mutator — `customFetch(url, init)` returns `{ data, status, headers }` where `data` is the untouched envelope; call sites read `res.data.data`. Verified against actual generated call sites, not just the plan's assumption.
- [x] `lib/api/generated/` is tracked by git (`git ls-files` lists it) — not ignored.
- [x] `lib/api/generated/` untouched by hand (`git diff` after a fresh `pnpm codegen` is empty).
- [x] `pnpm --filter=web build`, `check-types`, and `lint` exit 0.
- [x] `pnpm --filter=web dev` serves `localhost:3000` with no runtime error in the browser console.
- [x] No file in this phase exceeds 300 lines.
- [x] Grep for `course` / `Course` across `apps/web/` returns zero hits.

## Risk Assessment

| #   | Risk                                                                                                                                                                                          | Likelihood | Impact   | Mitigation                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Codegen attempted before Phase 2 → near-empty client, hooks silently missing in Phase 4                                                                                                       | **High**   | Med      | Step 7 explicitly gated on Phase 2; re-run `pnpm codegen` at the start of Phase 4                                                                                       |
| R2  | Mutator signature mismatch with Orval's expected shape → generated code fails to compile                                                                                                      | Med        | **High** | Verify against the first generated file immediately; adjust the `config` param type to whatever Orval emits                                                             |
| R3  | **Implementer adds an unwrap in the mutator anyway** (copying V3's deferred TODO, or "to make call sites nicer") → generated types and runtime values desync again, in the opposite direction | Med        | **High** | Explicit comment in step 5; success criterion greps for it. The V3 TODO that suggested unwrapping is **resolved and removed** — the backend added envelope DTOs instead |
| R4  | Orval emits an anonymous/`Response200`-named type instead of a clean envelope model                                                                                                           | Med        | Med      | Step 7 inspection catches it; root cause is a Phase 2 `allOf` regression, fixed there not here                                                                          |
| R5  | `shadcn init --monorepo` run by mistake → conflicting `packages/ui` scaffold                                                                                                                  | Med        | Med      | Explicitly forbidden in Key Insights; if it happens, delete the generated `packages/ui` and re-run plain init                                                           |
| R6  | Tailwind v4 vs v3 config mismatch → styles silently absent                                                                                                                                    | Med        | Med      | Verify one utility class renders before building further UI                                                                                                             |
| R7  | Module-level QueryClient singleton on the server leaks cache between users                                                                                                                    | Low        | **High** | `getQueryClient()` per-request on server (step 8)                                                                                                                       |
| R8  | `localStorage` access during SSR → `ReferenceError: window is not defined`                                                                                                                    | Med        | Med      | `getToken()` guards `typeof window`                                                                                                                                     |
| R9  | Devtools shipped to production bundle                                                                                                                                                         | Low        | Low      | Conditional import on `NODE_ENV`                                                                                                                                        |

**Rollback:** self-contained in `apps/web`; revert the commit. Generated dir is reproducible from `openapi.json`, so nothing is lost.

## Security Considerations

- **Token in `localStorage` is XSS-readable** — accepted trade-off for a base template (matches research). Mitigations: never render server-supplied text with `dangerouslySetInnerHTML`; keep third-party scripts out. httpOnly-cookie auth is deferred — flag it to anyone cloning this template for a security-sensitive product.
- There are **no client-side route guards in this phase**, because there is no authenticated area. When one is added, note that client guards are UX only — and that the server guards they would defer to are **also stubbed** (Phase 2). This skeleton has no authorization at any layer. Do not deploy it.
- `Authorization` header omitted entirely when no token — avoids sending the literal string `"null"`.
- No secrets in `NEXT_PUBLIC_*` beyond the API base URL.
- CORS origin must match the web dev origin configured in Phase 2.

## Next Steps

Unblocks Phase 4. Re-run `pnpm codegen` first thing in Phase 4 to be sure the client matches the current backend.
