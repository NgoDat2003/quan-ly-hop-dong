# Adding a backend module

This base ships exactly two modules — `access-control` and `auth` (plus `users`, which `auth` depends on). There is no scaffolded example module to copy; `auth`/`users` are the live reference, because they actually boot.

## Module shape

```
modules/{name}/
├── {name}.module.ts
├── {name}.controller.ts
├── {name}.service.ts
└── dto/
    ├── {thing}.dto.ts
    └── {thing}-response.dto.ts   (envelope, see below)
```

## Steps to add one

1. Add the model to `apps/api/prisma/schema.prisma`.
2. `pnpm --filter=api prisma:migrate` (then `pnpm --filter=api prisma:generate` if you didn't use `migrate dev`).
3. Create the module folder above.
4. Register the module in `src/app.module.ts`.
5. `pnpm codegen` from the repo root.
6. Consume the generated hook on the frontend — never hand-write a client.

## Controller / service boundary

Controllers stay thin: route decorators, DTO validation, one service call. Business logic goes in the service. Split a service into `services/{name}-read|-workflow|-shared.service.ts` **only** when it passes 500 lines or 6 injected dependencies — a threshold, not a default. Don't pre-split a fresh module for a rule it hasn't hit yet.

**Never query another module's table via `PrismaService` directly.** Import that module and inject its exported service instead. This is the cross-module boundary the original example module existed to demonstrate — with the example gone, the rule is stated here instead.

## `operationId` and envelope DTOs

Every endpoint gets an explicit `operationId`, domain-prefixed (e.g. `authLogin`, not `login`). It becomes the frontend hook name; a collision silently overwrites a hook.

Every response gets an envelope DTO:

```typescript
export class ThingResponseDto extends ApiResponseDto {
  @ApiProperty({ type: ThingDto })
  declare data: ThingDto;
}
```

`TransformInterceptor` wraps every response in `{ statusCode, data }`. Document the bare inner DTO and every generated frontend type is wrong. Services return the **inner** shape only — never pre-wrapped, or the interceptor double-wraps it.

**Envelope upgrade trigger:** if concrete wrapper classes start multiplying uncomfortably (many endpoints, or a shared paginated `{ data: T[], meta }` shape), switch to the generic `ApiResponseDto<T>` + `@ApiExtraModels` + `getSchemaPath()` + `allOf` decorator pattern. That pattern produces inline OpenAPI schemas rather than named `components/schemas` entries, so verify Orval's output naming carefully when making the switch.

## What is still stubbed in this base

- Every `UsersService` and `AuthService` method body.
- `JwtAuthGuard.canActivate` and `PermissionsGuard.canActivate` — both currently `return true`.
- `JwtStrategy.validate()` — returns a hardcoded user, never looks one up.
- `hasPermission()` in `role-permissions.ts` — returns `true` unconditionally.
- The frontend's `useAuthActions().login` — calls the real endpoint but does nothing with the result.

Ownership checks (owner-or-ADMIN) belong in the **service**, after loading the row — not in a guard, which never sees the row.

## After changing a DTO or endpoint

Run `pnpm codegen`, then consume the generated hook. Never hand-write a client — if a hook is missing or wrong, the fix is a backend DTO/decorator change plus a re-run, not a hand patch in `apps/web/lib/api/generated/`.
