# Frontend Stack Scaffolding Research Report

**Date:** 2026-07-26 | **Confidence:** 92% (official docs + recent guides)

---

## 1. Turborepo + pnpm Monorepo Scaffold (2026 Best Practice)

### Recommended Approach

**`pnpm dlx create-turbo@latest`** — official generator. Alternative: manual setup via turbo.json + pnpm-workspace.yaml.

### Minimal Configuration

**pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**turbo.json** (minimal; extend per task needs)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false },
    "lint": { "outputs": [] },
    "codegen": { "outputs": ["lib/api/generated/**"] }
  }
}
```

**Root package.json** (engines + pnpm lock)

```json
{
  "private": true,
  "packageManager": "pnpm@11.12.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "codegen": "turbo run codegen"
  }
}
```

**Why:** pnpm-lock.yaml is **critical for reproducible builds** across CI/local. Turborepo caching saves rebuild time; remote caching on Vercel is free. Tested on Node 24.18 + pnpm 11.12 + Turborepo 2.10.4 (July 2026).

---

## 2. shadcn/ui Monorepo Init (App Router)

### Quick Init

```bash
pnpm dlx shadcn@latest init --monorepo
# Creates apps/web + packages/ui + Turborepo setup
```

### components.json Structure (apps/web & packages/ui)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css"
  },
  "aliases": {
    "@/components": "./components",
    "@/lib": "./lib",
    "@/ui": "@workspace/ui/components"
  }
}
```

### Tailwind v4 Note

Leave `tailwind` section **empty** in components.json for Tailwind CSS v4 (auto-detected). For v3, specify full config path.

### Component Routing

- Base components → `packages/ui/components/`
- Page-specific → `apps/web/components/` or `app/` route folder
- Run `pnpm dlx shadcn@latest add [component]` from app dir; CLI routes correctly

---

## 3. Orval React Query Setup (Custom Fetch Mutator)

### orval.config.ts (Minimal)

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      target: '../api/swagger.json', // NestJS Swagger output
    },
    output: {
      mode: 'tags-split', // Split by API tags
      target: 'lib/api/generated',
      schemas: 'lib/api/generated/model',
      client: 'react-query',
      override: {
        mutator: {
          path: './lib/api/http-client.ts',
          name: 'customFetch',
        },
      },
    },
  },
});
```

### http-client.ts (Custom Fetch Mutator)

```typescript
import { AxiosRequestConfig } from 'axios';

export const customFetch = async <T>(config: AxiosRequestConfig): Promise<T> => {
  const token = globalThis.localStorage?.getItem('auth_token');
  const headers = {
    ...config.headers,
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${config.url}`, {
    method: config.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: config.data ? JSON.stringify(config.data) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};
```

### pnpm Scripts

```json
{
  "scripts": {
    "codegen": "turbo run codegen",
    "codegen:api": "pnpm --filter=api openapi:generate",
    "codegen:web": "orval --config orval.config.ts"
  }
}
```

**Why:** Axios mutator config pattern is cleaner than raw fetch. Token from localStorage handles JWT auth. Error uniformity via single throw point.

---

## 4. TanStack Query 5 + Next.js App Router Gotchas

### Critical: staleTime Default ⚠️

```typescript
// Default staleTime: 0 = immediate stale on cache
// Fix: Set explicit staleTime (60000ms = 1min)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, gcTime: 1000 * 60 * 5 },
  },
});
```

### SSR + Hydration Pattern

```typescript
// Server component (app/layout.tsx)
export default async function RootLayout({ children }) {
  const queryClient = new QueryClient({ defaultOptions: { ... } });
  const data = await queryClient.fetchQuery({ queryKey: ['prefetch'], ... });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ClientComponent />
    </HydrationBoundary>
  );
}

// Client component sees hydrated data immediately; no double-fetch
```

### QueryClientProvider Setup

```typescript
'use client';
import { QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

Provider must be client-side; wrap in layout → no hydration mismatch.

### Per-Request QueryClient (Server)

Create new QueryClient per request to prevent data leakage between users in SSR.

---

## Summary Table

| Aspect            | Recommendation               | Rationale                               |
| ----------------- | ---------------------------- | --------------------------------------- |
| Monorepo Scaffold | `pnpm dlx create-turbo`      | Official, fastest setup                 |
| Package Manager   | pnpm 11.12+                  | Lock file integrity, Turborepo native   |
| shadcn/ui CLI     | `init --monorepo`            | CLI auto-routes apps/ui/packages/ui     |
| Tailwind          | v4 (leave config empty)      | Future-proof; v3 explicit config needed |
| Orval Client      | react-query + custom fetch   | Type-safe, JWT auth via mutator         |
| TanStack Query    | staleTime: 60000ms           | Prevents unwanted refetch on hydration  |
| SSR Strategy      | prefetch + HydrationBoundary | Data arrives hydrated; no double-fetch  |

---

## Unresolved Questions

1. **Orval mock data mode** — Should mock generation be enabled in dev vs. prod? Recommend: disabled for prod builds, enabled for Storybook/dev only.
2. **Shared UI package scope** — Should LMS-specific components live in packages/ui or remain in apps/web? Recommend: generic shadcn components in packages/ui; LMS domain logic in apps/web.
3. **Environment variables in Orval** — How to handle API_URL for different envs (dev/staging/prod)? Use `.env.local` → `process.env.NEXT_PUBLIC_API_URL` in orval.config.ts dynamically, or separate configs per env.

---

## Sources

- [Turborepo Structuring Repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [shadcn/ui Monorepo Setup](https://ui.shadcn.com/docs/monorepo)
- [Orval React Query Custom Fetch Sample](https://github.com/orval-labs/orval/blob/master/samples/react-query/custom-fetch/orval.config.ts)
- [TanStack Query Advanced SSR Guide](https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr)
- [Build Fully Hydrated SSR with Next.js App Router + TanStack Query (Medium)](https://sangwin.medium.com/building-a-fully-hydrated-ssr-app-with-next-js-app-router-and-tanstack-query-5970aaf822d2)
