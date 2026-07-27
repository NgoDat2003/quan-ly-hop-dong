---
phase: 3
title: 'ESLint Passthrough Comments'
status: completed
priority: P3
effort: '15m'
dependencies: []
---

# Phase 3: ESLint Passthrough Comments

## Overview

`packages/eslint-config/nest.js` and `next.js` are currently pure no-op passthroughs (`export const nest = [...base]`). Add a one-line comment to each explaining this is a deliberate minimal starting point, not an oversight — and note the concrete trigger for extending them (`eslint-config-next` is already installed in `apps/web/package.json` but never consumed, which is the most likely first real change).

## Requirements

**Functional:** none — this is a documentation-only change to prevent a future reader from wondering whether the empty passthrough is a bug.

**Non-functional:** no behavior change; lint results must be byte-identical before/after.

## Architecture

```
packages/eslint-config/
├── nest.js   # MODIFY — add TODO comment
└── next.js   # MODIFY — add TODO comment
```

## Related Code Files

**Modify:** `packages/eslint-config/nest.js`, `packages/eslint-config/next.js`.

## Implementation Steps

1. In `nest.js`, above `export const nest = [...base];`, add:

   ```javascript
   // Intentional minimal passthrough — no NestJS-specific rules yet (e.g.
   // @typescript-eslint/no-floating-promises for guard/interceptor code).
   // Extend here once apps/api grows beyond the current stub scope.
   ```

2. In `next.js`, above `export const next = [...base];`, add:

   ```javascript
   // Intentional minimal passthrough — eslint-config-next is installed in
   // apps/web/package.json but not wired in here. Extend this file to
   // consume it once apps/web has more than one route.
   ```

3. Run `pnpm lint` from repo root to confirm zero behavior change.

## Success Criteria

- [x] Both files have the explanatory comment.
- [x] `pnpm lint` output is identical to the pre-change baseline (same exit code, no new warnings/errors).

## Risk Assessment

Negligible — comment-only change. No rollback plan needed beyond reverting the two lines.
