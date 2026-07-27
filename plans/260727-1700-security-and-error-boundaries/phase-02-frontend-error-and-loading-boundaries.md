---
phase: 2
title: "Frontend Error and Loading Boundaries"
status: pending
priority: P2
effort: "30m"
dependencies: []
---

# Phase 2: Frontend Error and Loading Boundaries

## Overview

Add the four root-level Next.js App Router special files that `apps/web/app/` currently lacks entirely: `error.tsx`, `not-found.tsx`, `global-error.tsx`, `loading.tsx`. Without these, an unhandled runtime error white-screens with no fallback UI, and route transitions have no loading indicator. Root-level placement is sufficient — Next.js inherits the nearest boundary down the route tree, and there is only one route group today (`(auth)/login`).

## Requirements

- Functional: an error thrown anywhere under `app/` renders a styled fallback with a retry action instead of a blank page; a 404 renders a styled not-found page; `loading.tsx` shows during route-level suspense.
- Non-functional: fallback UI reuses existing shadcn primitives (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Button`) already used in `features/auth/components/login-form.tsx` — no new component library, no plain unstyled text.

## Architecture

Four independent files at `apps/web/app/`, each following Next.js's documented contract:
- `error.tsx` — client component, receives `{ error, reset }` props, catches errors in the segment below it (here: everything, since it's root-level and there's no nested error.tsx yet).
- `global-error.tsx` — client component, must render its own `<html>`/`<body>` (replaces the root layout entirely when it fires) — only triggers for errors in the root layout itself, which `error.tsx` cannot catch.
- `not-found.tsx` — server component, renders when `notFound()` is called or a route doesn't match.
- `loading.tsx` — server component, automatic Suspense fallback shown while a route segment loads.

## Related Code Files

- Create: `apps/web/app/error.tsx`
- Create: `apps/web/app/not-found.tsx`
- Create: `apps/web/app/global-error.tsx`
- Create: `apps/web/app/loading.tsx`

## Implementation Steps

1. Create `apps/web/app/error.tsx`:

   ```tsx
   'use client';

   import { Button } from '@/components/ui/button';
   import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

   export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
     return (
       <div className="flex min-h-svh w-full items-center justify-center p-6">
         <Card className="w-full max-w-sm">
           <CardHeader>
             <CardTitle>Đã xảy ra lỗi</CardTitle>
             <CardDescription>{error.message || 'Có lỗi không xác định xảy ra.'}</CardDescription>
           </CardHeader>
           <CardContent>
             <Button onClick={reset} className="w-full">
               Thử lại
             </Button>
           </CardContent>
         </Card>
       </div>
     );
   }
   ```

2. Create `apps/web/app/not-found.tsx` (server component — no `'use client'`, no `reset` since there's nothing to retry):

   ```tsx
   import Link from 'next/link';
   import { Button } from '@/components/ui/button';
   import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

   export default function NotFound() {
     return (
       <div className="flex min-h-svh w-full items-center justify-center p-6">
         <Card className="w-full max-w-sm">
           <CardHeader>
             <CardTitle>Không tìm thấy trang</CardTitle>
             <CardDescription>Trang bạn tìm không tồn tại hoặc đã bị di chuyển.</CardDescription>
           </CardHeader>
           <CardContent>
             <Button asChild className="w-full">
               <Link href="/">Về trang chủ</Link>
             </Button>
           </CardContent>
         </Card>
       </div>
     );
   }
   ```

   Note: `Button asChild` requires the `Button` component to support Radix/base-ui's `render`-as-child pattern — verify against `components/ui/button.tsx`'s actual prop surface (`ButtonPrimitive.Props`) during implementation; if `asChild` isn't supported by this project's `@base-ui/react/button` wrapper, render a plain `<Link>` styled with `buttonVariants({ className })` instead (already exported from `button.tsx`).

3. Create `apps/web/app/global-error.tsx` (must render its own `<html>`/`<body>` — this replaces the root layout when the root layout itself throws):

   ```tsx
   'use client';

   import { Button } from '@/components/ui/button';
   import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

   export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
     return (
       <html lang="en">
         <body>
           <div className="flex min-h-svh w-full items-center justify-center p-6">
             <Card className="w-full max-w-sm">
               <CardHeader>
                 <CardTitle>Ứng dụng gặp sự cố</CardTitle>
                 <CardDescription>{error.message || 'Có lỗi nghiêm trọng xảy ra.'}</CardDescription>
               </CardHeader>
               <CardContent>
                 <Button onClick={reset} className="w-full">
                   Thử lại
                 </Button>
               </CardContent>
             </Card>
           </div>
         </body>
       </html>
     );
   }
   ```

   Note: `global-error.tsx` cannot use the project's font/`cn` setup from the root layout (it replaces that layout entirely) — keep it dependency-free from `app/layout.tsx`, relying only on global CSS already loaded (Tailwind classes still work since `globals.css` is a separate import chain, not tied to the layout component itself). Verify Tailwind classes actually render here during manual testing, since this file bypasses the normal layout tree.

4. Create `apps/web/app/loading.tsx` (server component, minimal — this is a route-transition flicker guard, not a full-page skeleton):

   ```tsx
   export default function Loading() {
     return (
       <div className="flex min-h-svh w-full items-center justify-center p-6">
         <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
       </div>
     );
   }
   ```

5. Run `pnpm --filter=web build && pnpm --filter=web lint && pnpm --filter=web check-types`.
6. Manual verification: temporarily throw an error inside `app/page.tsx` (e.g., `throw new Error('test')` at the top of the component body), confirm `error.tsx` renders instead of a white screen, confirm "Thử lại" calls `reset()` without a full page reload. Remove the temporary throw afterward. Navigate to a nonexistent route (e.g., `/does-not-exist`) and confirm `not-found.tsx` renders.

## Success Criteria

- [ ] `apps/web/app/error.tsx`, `not-found.tsx`, `global-error.tsx`, `loading.tsx` all exist and export a default component matching Next.js's contract for each file.
- [ ] All four reuse `Card`/`Button` from `@/components/ui/*` — no plain unstyled text, no new UI library.
- [ ] A thrown error inside any route renders the `error.tsx` fallback (verified with a temporary throw, removed after verification — not left in the codebase).
- [ ] Navigating to a nonexistent route renders `not-found.tsx`.
- [ ] `pnpm build && pnpm lint && pnpm check-types && pnpm test` exit 0 from repo root.

## Risk Assessment

- **Risk:** `global-error.tsx` silently fails to style correctly because it bypasses `app/layout.tsx` (no `Geist` font variable, no `cn()`-applied `font-sans` class). **Mitigation:** flagged inline in step 3 — verify Tailwind utility classes still render (they should, since `globals.css` is loaded independently), accept unstyled font fallback as acceptable for this rarely-triggered last-resort boundary rather than duplicating the font/providers setup into a file that's supposed to work even when the root layout itself is broken.
- **Risk:** `Button asChild` pattern (used in `not-found.tsx` for the `Link`-as-button case) may not be supported by this project's `@base-ui/react/button` wrapper — the codebase uses `@base-ui/react`, not Radix's `Slot` primitive directly, so `asChild` support isn't guaranteed the way it would be with shadcn's default Radix-based `Button`. **Mitigation:** flagged inline in step 2 — check `button.tsx`'s actual prop type during implementation before assuming `asChild` works; fall back to `buttonVariants({ className })` applied directly to a `<Link>` if not.
- **Risk:** Vietnamese copy ("Đã xảy ra lỗi", "Không tìm thấy trang") introduces a hardcoded-language decision this base template hasn't made elsewhere (existing UI text in `login-form.tsx` is also Vietnamese, e.g. "Đăng nhập" — so this matches existing precedent, not a new inconsistency).
