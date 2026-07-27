---
phase: 2
title: 'Backend Foundation: User + Auth Stub + Envelope'
status: completed
priority: P1
effort: 3h
dependencies: [1]
---

# Phase 2: Backend Foundation (User + Auth Stub + Envelope)

## Context Links

- [Backend stack report §1–§3](./research/researcher-02-backend-stack-report.md) — **package-API reference only**, not its business logic
- `.agent/projectRules/backend-architecture.md` → module structure, boundary conventions
- Depends on: Phase 1. Blocks: the codegen step of Phase 3, and all of Phase 4.

## Overview

**Priority:** P1 | **Status:** Pending | **Effort:** ~3h

This phase is the **entire backend**. There is no domain module after it, because `User`/auth is the only backend surface in scope.

Delivers: Docker Compose Postgres, `schema.prisma` with `User` + `Role` **and nothing else**, `PrismaService`/`PrismaModule`, `AccessControlModule` (guards + decorators + strategy, registered via `APP_GUARD`), `AuthModule`, `UsersModule`, global `ValidationPipe` + `TransformInterceptor`, **envelope response DTO classes**, Swagger + standalone OpenAPI export.

**No authentication actually happens. No password is ever hashed. No user is ever looked up.** The files that would do those things exist, are injected correctly, and return placeholder values.

Two endpoints only: `POST /auth/login` and `GET /auth/me`. Register is cut — the frontend has no register page, so the endpoint would be dead surface.

## Stub vs Real — the explicit line for this phase

This table is the most important thing in this file. Consult it before writing any method body.

| Piece                                                                          | Verdict                      | Reason                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker-compose.yml` Postgres                                                  | **REAL**                     | `prisma migrate` must run once to prove the schema is valid; `openapi:generate` boots Nest which `$connect`s                                                             |
| `schema.prisma` field definitions                                              | **REAL**                     | Schema fields are structure. Must be valid Prisma or `migrate` fails                                                                                                     |
| `PrismaService.onModuleInit/$connect`, `onModuleDestroy/$disconnect`           | **REAL**                     | Minimum needed to boot, and the lifecycle wiring is the thing being demonstrated                                                                                         |
| `PrismaModule` `@Global()` decorator + providers/exports                       | **REAL**                     | Wiring                                                                                                                                                                   |
| Decorator factories (`@Public`, `@RequirePermissions`, `@CurrentUser`)         | **REAL**                     | ~3 lines each of `SetMetadata`/`createParamDecorator`. Declarative plumbing; the auth controller won't compile without them                                              |
| `JwtStrategy` **constructor** (`super({ jwtFromRequest, secretOrKey, ... })`)  | **REAL**                     | `passport-jwt` throws `TypeError: JwtStrategy requires a secret or key` **at construction time**, i.e. during Nest bootstrap. A stubbed constructor crashes `nest start` |
| `JwtStrategy.validate()` **body**                                              | **STUB**                     | Only invoked per-request, never at boot. Returns a hardcoded user-shaped object                                                                                          |
| `JwtAuthGuard.canActivate()`                                                   | **STUB**                     | `return true` — see note below                                                                                                                                           |
| `PermissionsGuard.canActivate()`                                               | **STUB**                     | `return true`                                                                                                                                                            |
| `APP_GUARD` registration in `AccessControlModule`                              | **REAL**                     | The wiring IS the deliverable; guards must be registered even though they no-op                                                                                          |
| `JwtModule.registerAsync` config                                               | **REAL**                     | Minimum to construct. `AuthService` injects `JwtService`; a broken factory fails at boot                                                                                 |
| `role-permissions.ts` map                                                      | **REAL data, STUB function** | The `ROLE_PERMISSIONS` const is a structural constant; `hasPermission()` returns `true` (stub)                                                                           |
| `AuthService.login/me` bodies                                                  | **STUB**                     | No bcrypt, no `findByEmail`, no `signAsync`                                                                                                                              |
| `UsersService` method bodies                                                   | **STUB**                     | No Prisma queries                                                                                                                                                        |
| All DTO classes + `@ApiProperty` + class-validator decorators                  | **REAL**                     | Declarative structure. They generate the OpenAPI schema Orval consumes — stub them and codegen produces garbage                                                          |
| **Envelope response DTO classes (`ApiResponseDto` + per-endpoint subclasses)** | **REAL**                     | **Restored this revision.** They make the documented schema match the wire shape. Pure declaration, no logic                                                             |
| `TransformInterceptor`, `HttpExceptionFilter`                                  | **REAL, minimal**            | ~10 lines each, pure plumbing with no domain knowledge. Cheaper to write correctly than to stub                                                                          |
| `main.ts` bootstrap (pipes, CORS, Swagger, listen)                             | **REAL**                     | This is literally "the app boots"                                                                                                                                        |
| `scripts/generate-openapi.ts`                                                  | **REAL**                     | Codegen depends on it producing a valid document                                                                                                                         |
| `prisma/seed.ts`                                                               | **CUT**                      | Seeding is data; there is no logic to exercise with it                                                                                                                   |
| `PaginationQueryDto`                                                           | **CUT**                      | No endpoint lists anything. V3 created it for the Course list, which no longer exists                                                                                    |
| `POST /auth/register`                                                          | **CUT**                      | No register page in scope; a consumerless endpoint is dead surface                                                                                                       |

> **Guard stub note.** `JwtAuthGuard.canActivate()` returning `true` means every route is open. That is intentional and correct for a scaffold: real JWT validation would make `GET /auth/me` 401 in Swagger UI, blocking the "Swagger shows the stub endpoints and they respond" success criterion. Leave a prominent `// TODO: implement — currently allows all requests` comment. Security is explicitly deferred (see `plan.md` → Not in Scope).

## Key Insights

### Envelope pattern — decision and rationale (new this revision)

The user explicitly asked for the envelope wrapper class to come back, so the documented OpenAPI schema matches the real wire format and Orval-generated types are accurate. Two candidate patterns were evaluated:

**(a) Generic `ApiResponseDto<T>` + `@ApiExtraModels` + `getSchemaPath()` + `allOf`** — the canonical NestJS answer to generics, since TypeScript generics are erased and the Swagger plugin cannot see `T`. Requires a custom decorator per response shape:

```typescript
export const ApiOkResponseWrapped = <D extends Type<unknown>>(dataDto: D) =>
  applyDecorators(
    ApiExtraModels(ApiResponseDto, dataDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseDto) },
          { properties: { data: { $ref: getSchemaPath(dataDto) } } },
        ],
      },
    }),
  );
```

**(b) Concrete per-endpoint wrapper classes** — one small class per response shape:

```typescript
export class AuthLoginResponseDto extends ApiResponseDto {
  @ApiProperty({ type: AuthResultDto })
  declare data: AuthResultDto;
}
```

**Chosen: (b), concrete subclasses.** Reasons, in order of weight:

1. **Orval output quality.** (a) emits an **inline `allOf` schema** in the path's response object, not a named entry in `components/schemas`. Orval then either inlines an anonymous intersection type or synthesizes a name from the operationId (e.g. `AuthLoginResponse200`) depending on the `aliasCombinedTypes` setting — predictable only after you run it and look. (b) puts a **named schema in `components/schemas`**, so Orval emits a clean, stable, importable `AuthLoginResponseDto` type every time. Since "generated types are accurate and concrete" is a plan-level success criterion, the pattern with the fewest codegen unknowns wins.
2. **Repeatability for future real modules.** (b) is a 4-line class that a developer copies without understanding `getSchemaPath`, `allOf`, or why generics vanish at runtime. (a) requires understanding all three before adding one endpoint. This base exists to be copied by people who did not write it.
3. **KISS / cost at this scale.** (b) costs 2 extra tiny classes for 2 endpoints. (a) costs a decorator factory plus per-endpoint `@ApiExtraModels` bookkeeping, and a dangling `$ref` when someone forgets the `@ApiExtraModels` — a silent, confusing failure mode.

**When to revisit:** (a) genuinely wins once there are many endpoints sharing a wrapper (especially a paginated `{ data: T[], meta }`), where (b)'s class count grows linearly. Record that in `modules/README.md` (Phase 5) as the documented upgrade trigger rather than pre-building it now (YAGNI).

`ApiResponseDto` is the shared base carrying `statusCode`; subclasses `declare data: X` with an `@ApiProperty`. Note `declare` (not a plain redeclaration) — required under `useDefineForClassFields` semantics so the subclass property does not emit a field initializer that shadows the base at runtime; it is a type/metadata-only override, which is exactly what is wanted.

### Other insights

- **The one thing that will actually crash bootstrap is the `JwtStrategy` constructor.** `PassportStrategy(Strategy)` invokes `super()` eagerly when Nest instantiates the provider. If `secretOrKey` is `undefined`, `passport-jwt` throws immediately and `nest start` dies. Use `config.get('JWT_SECRET') ?? 'dev-placeholder-secret'` rather than `getOrThrow` — a scaffold should boot on a fresh clone with no env setup.
- **Guard _registration order_ still matters structurally** even though both guards no-op. Register `JwtAuthGuard` then `PermissionsGuard` so the order is correct for whoever implements them.
- **`openapi:generate` boots the full Nest app**, so Postgres must be reachable when it runs (`PrismaService.onModuleInit` → `$connect`). This is why Docker stays in scope.
- **Response DTOs must be classes with `@ApiProperty`**, never interfaces — interfaces are erased at compile time and Orval emits `unknown`. This matters even in stub-mode because generated hook _types_ are a success criterion.
- **`TransformInterceptor` must not double-wrap.** It wraps every non-excluded response in `{ statusCode, data }`. The envelope DTOs describe that output; the services return the _inner_ shape only. Getting this backwards (service returning an already-wrapped object) produces `{statusCode, data:{statusCode, data}}` — call it out in a comment.

## Requirements

**Functional**

- `docker-compose.yml` at repo root running local Postgres; `DATABASE_URL` in `.env.example`.
- `schema.prisma` with `User` + `Role` enum **only**; migration applied once.
- Routes exist and respond with stub payloads: `POST /auth/login`, `GET /auth/me`.
- Every response documented with an **envelope DTO** whose shape matches what `TransformInterceptor` emits.
- `AccessControlModule` registers both guards via `APP_GUARD`; all three decorators exist and are importable.
- Swagger UI at `/api`; `pnpm --filter=api openapi:generate` writes `apps/api/openapi.json`.

**Non-functional**

- App boots with no env file present (placeholder defaults).
- `pnpm --filter=api build` exits 0.
- Every stub body carries a `// TODO: implement` comment.

## Architecture

```
docker-compose.yml                # local Postgres
apps/api/
├── prisma/
│   ├── schema.prisma             # User + Role enum. NOTHING ELSE
│   └── migrations/
├── openapi.json                  # generated artifact (Orval input)
├── scripts/generate-openapi.ts
└── src/
    ├── main.ts                   # ValidationPipe, Swagger, CORS, listen
    ├── app.module.ts
    ├── common/
    │   ├── dto/api-response.dto.ts        # ApiResponseDto base (envelope)
    │   ├── interceptors/transform.interceptor.ts
    │   └── filters/http-exception.filter.ts
    ├── prisma/
    │   ├── prisma.module.ts      # @Global()
    │   └── prisma.service.ts
    └── modules/
        ├── access-control/
        │   ├── access-control.module.ts   # @Global(), APP_GUARD x2
        │   ├── guards/{jwt-auth.guard.ts,permissions.guard.ts}
        │   ├── strategies/jwt.strategy.ts
        │   ├── decorators/{public.decorator.ts,require-permissions.decorator.ts,current-user.decorator.ts}
        │   └── role-permissions.ts
        ├── auth/
        │   ├── auth.module.ts, auth.controller.ts, auth.service.ts
        │   └── dto/{login.dto.ts,auth-result.dto.ts,auth-response.dto.ts}
        └── users/
            ├── users.module.ts, users.service.ts   # exports UsersService
            └── dto/{user-response.dto.ts,user-envelope.dto.ts}
```

**Wiring graph (this is what the phase delivers):**

```
AppModule
 ├── ConfigModule.forRoot({ isGlobal: true })
 ├── PrismaModule            @Global() → provides PrismaService
 ├── AccessControlModule     @Global() → APP_GUARD: JwtAuthGuard, PermissionsGuard
 │                                     → JwtStrategy, JwtModule
 │                                     → imports UsersModule
 ├── UsersModule             → exports UsersService
 └── AuthModule              → imports UsersModule; AuthService injects UsersService + JwtService
```

**Request flow (what actually happens in stub-mode):**

```
HTTP → JwtAuthGuard.canActivate() → true (stub, no token checked)
     → PermissionsGuard.canActivate() → true (stub)
     → ValidationPipe (REAL — DTO decorators enforce shape)
     → Controller (thin) → Service (stub body, returns the INNER shape)
     → TransformInterceptor → { statusCode, data: <inner> }
                              ^ this is exactly what the envelope DTO documents
```

Note the ValidationPipe is genuinely active: posting a malformed body to a stub endpoint still 400s, because the DTO decorators are real. That is a free correctness property of keeping DTOs real, not a feature being implemented.

## Related Code Files

**Create** — paths under `apps/api/`:
`prisma/schema.prisma`, `scripts/generate-openapi.ts`, `src/prisma/prisma.{module,service}.ts`, `src/common/dto/api-response.dto.ts`, `src/common/interceptors/transform.interceptor.ts`, `src/common/filters/http-exception.filter.ts`, `src/modules/access-control/**`, `src/modules/auth/**`, `src/modules/users/**`.

**Modify:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/package.json` (deps + scripts), root `.env.example`.

**Not created (cut):** `prisma/seed.ts`, `src/common/dto/pagination-query.dto.ts`, any register DTO/route, any module other than the three listed.

## Implementation Steps

0. **Local Postgres via Docker Compose.** Create `docker-compose.yml` at repo root:

   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       container_name: training-app-postgres
       restart: unless-stopped
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: postgres
         POSTGRES_DB: training_app
       ports:
         - '5432:5432'
       volumes:
         - postgres-data:/var/lib/postgresql/data
       healthcheck:
         test: ['CMD-SHELL', 'pg_isready -U postgres -d training_app']
         interval: 5s
         timeout: 5s
         retries: 5

   volumes:
     postgres-data:
   ```

   `.env.example` gets:

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/training_app?schema=public"
   JWT_SECRET="dev-placeholder-secret-not-for-production"
   ```

   Local-dev-only credentials; fine to commit.

1. **Install deps.**
   `pnpm --filter=api add @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/swagger @prisma/client passport passport-jwt class-validator class-transformer`
   `pnpm --filter=api add -D prisma @types/passport-jwt ts-node`

   **`bcrypt` is NOT installed** — no password is hashed in this plan. Whoever implements `AuthService` adds it then.

2. **Prisma schema — REAL field definitions, ONE model.**

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   generator client { provider = "prisma-client-js" }

   enum Role { ADMIN TRAINER TRAINEE }

   model User {
     id        String   @id @default(cuid())
     email     String   @unique
     password  String
     name      String
     role      Role     @default(TRAINEE)
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt
   }
   ```

   **That is the whole schema.** One model, one enum, zero relations. Fields are structure, so they are real — but nothing ever queries them in this plan. Do not add a second model "to show a relation"; the user explicitly cut that.

3. **PrismaService + PrismaModule — REAL (boot-critical lifecycle).**

   ```typescript
   // src/prisma/prisma.service.ts
   import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
   import { PrismaClient } from '@prisma/client';

   @Injectable()
   export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
     private readonly logger = new Logger(PrismaService.name);
     async onModuleInit() {
       await this.$connect();
       this.logger.log('Database connected');
     }
     async onModuleDestroy() {
       await this.$disconnect();
     }
   }
   ```

   ```typescript
   // src/prisma/prisma.module.ts
   @Global()
   @Module({ providers: [PrismaService], exports: [PrismaService] })
   export class PrismaModule {}
   ```

4. **Migrate + generate.** `docker compose up -d`, set `DATABASE_URL` in `apps/api/.env`, then `pnpm --filter=api exec prisma migrate dev --name init_user` and `prisma generate`. Add scripts: `"prisma:migrate": "prisma migrate dev"`, `"prisma:generate": "prisma generate"`, `"prisma:reset": "prisma migrate reset --force"`. (No `prisma:seed` — seed is cut.)

5. **Envelope DTOs — REAL, and the new structural piece.**

   Shared base, `src/common/dto/api-response.dto.ts`:

   ```typescript
   import { ApiProperty } from '@nestjs/swagger';

   /**
    * Base envelope. TransformInterceptor produces { statusCode, data } for every
    * successful response, so every documented response type extends this.
    * Services return ONLY the inner `data` shape — never a pre-wrapped object,
    * or the interceptor double-wraps it.
    */
   export abstract class ApiResponseDto {
     @ApiProperty({ example: 200 })
     statusCode!: number;
   }
   ```

   Per-endpoint concrete subclass — one per response shape. `src/modules/auth/dto/auth-response.dto.ts`:

   ```typescript
   export class AuthLoginResponseDto extends ApiResponseDto {
     @ApiProperty({ type: AuthResultDto })
     declare data: AuthResultDto;
   }
   ```

   and `src/modules/users/dto/user-envelope.dto.ts`:

   ```typescript
   export class UserEnvelopeDto extends ApiResponseDto {
     @ApiProperty({ type: UserResponseDto })
     declare data: UserResponseDto;
   }
   ```

   `declare` is deliberate — it declares the property for typing/Swagger metadata without emitting a runtime field initializer. Controllers then document with the envelope: `@ApiOkResponse({ type: AuthLoginResponseDto })`.

   **Inner DTOs stay separate and are still classes with `@ApiProperty`:** `AuthResultDto` (`accessToken`, `user: UserResponseDto`) and `UserResponseDto` (`id`, `email`, `name`, `role` — **never** `password`).

6. **Access-control decorators — REAL** (a few lines each; the auth controller won't compile without them):

   ```typescript
   // public.decorator.ts
   export const PUBLIC_KEY = 'isPublic';
   export const Public = () => SetMetadata(PUBLIC_KEY, true);

   // require-permissions.decorator.ts
   export const REQUIRE_PERMISSIONS_KEY = 'requiredPermissions';
   export const RequirePermissions = (...perms: string[]) =>
     SetMetadata(REQUIRE_PERMISSIONS_KEY, perms);

   // current-user.decorator.ts
   export const CurrentUser = createParamDecorator(
     (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
   );
   ```

   Also export an `AuthUser` type (`{ id: string; email: string; role: string; name: string }`) — controllers reference it in signatures.

7. **`role-permissions.ts` — real const, stub function.** Keep the map generic (no domain permissions — there is no domain):

   ```typescript
   export const ROLE_PERMISSIONS: Record<string, string[]> = {
     ADMIN: ['*'],
     TRAINER: [],
     TRAINEE: [],
   };

   // TODO: implement — evaluate `required` against ROLE_PERMISSIONS[role],
   // handling the ADMIN '*' wildcard. Currently allows everything.
   export function hasPermission(_role: string, _required: string[]): boolean {
     return true;
   }
   ```

   TRAINER/TRAINEE arrays are empty on purpose: permission strings name resources, and no resource module exists yet. Whoever adds the first module adds its strings here.

8. **`JwtStrategy` — REAL constructor, STUB validate.** The constructor call is the single piece of auth code that must work, or the app will not boot.

   ```typescript
   @Injectable()
   export class JwtStrategy extends PassportStrategy(Strategy) {
     constructor(config: ConfigService) {
       // REAL: passport-jwt throws at construction if secretOrKey is undefined,
       // which would crash Nest bootstrap. Fallback keeps a fresh clone booting
       // with no .env file present.
       super({
         jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
         ignoreExpiration: false,
         secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-placeholder-secret',
       });
     }

     // TODO: implement — look up the user by payload.sub via UsersService
     // and throw UnauthorizedException if absent.
     async validate(payload: { sub?: string }) {
       return {
         id: payload?.sub ?? 'stub-user-id',
         email: 'stub@example.com',
         role: 'ADMIN',
         name: 'Stub User',
       };
     }
   }
   ```

   It does **not** inject `UsersService` — the stub has nothing to look up with. Whoever implements `validate()` adds that dependency (and `AccessControlModule` already imports `UsersModule`, so it will resolve).

9. **Guards — STUB bodies, REAL class shape.**

   ```typescript
   // jwt-auth.guard.ts
   @Injectable()
   export class JwtAuthGuard extends AuthGuard('jwt') {
     constructor(private readonly reflector: Reflector) {
       super();
     }

     // TODO: implement — check PUBLIC_KEY metadata via this.reflector,
     // then delegate to super.canActivate(context) for non-public routes.
     // Currently allows ALL requests through, authenticated or not.
     canActivate(_context: ExecutionContext) {
       return true;
     }
   }
   ```

   ```typescript
   // permissions.guard.ts
   @Injectable()
   export class PermissionsGuard implements CanActivate {
     constructor(private readonly reflector: Reflector) {}

     // TODO: implement — read REQUIRE_PERMISSIONS_KEY metadata, resolve the
     // request user's role, call hasPermission(), throw ForbiddenException.
     // Currently allows ALL requests.
     canActivate(_context: ExecutionContext): boolean {
       return true;
     }
   }
   ```

   Keep the injected `Reflector` in both constructors — it is the DI wiring being demonstrated, and removing it means whoever implements the body has to re-add it.

10. **`AccessControlModule` (`@Global()`) — REAL wiring.** Registration order defines execution order; keep JWT first even though both no-op.

    ```typescript
    @Global()
    @Module({
      imports: [
        PassportModule,
        UsersModule,
        JwtModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (c: ConfigService) => ({
            secret: c.get<string>('JWT_SECRET') ?? 'dev-placeholder-secret',
            signOptions: { expiresIn: c.get('JWT_EXPIRES_IN') ?? '7d' },
          }),
        }),
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard }, // runs first
        { provide: APP_GUARD, useClass: PermissionsGuard }, // runs second
      ],
      exports: [JwtModule],
    })
    export class AccessControlModule {}
    ```

11. **`UsersModule` — real wiring, stub service.** `UsersService` is the designated owner of the `User` table (convention preserved for whoever implements it). Methods declared with correct signatures, bodies stubbed:

    ```typescript
    @Injectable()
    export class UsersService {
      constructor(private readonly prisma: PrismaService) {} // REAL: DI wiring

      // TODO: implement — prisma.user.findUnique({ where: { id } })
      async findById(_id: string): Promise<UserResponseDto | null> {
        return null;
      }

      // TODO: implement — prisma.user.findUnique({ where: { email } }), includes password hash
      async findByEmail(_email: string): Promise<unknown | null> {
        return null;
      }

      // TODO: implement — prisma.user.create(...). Kept as a signature slot for
      // whoever adds registration; no endpoint calls it in this base.
      async create(_data: {
        email: string;
        password: string;
        name: string;
      }): Promise<UserResponseDto> {
        throw new Error('not implemented');
      }
    }
    ```

    `exports: [UsersService]`. No controller. (`findByIds` from V3 is dropped — it existed only for the Course list's creator-name lookup.)

12. **`AuthModule` — real wiring, stub service, REAL DTOs.** `AuthService` injects `UsersService` + `JwtService` (the boundary convention, preserved). Controller is thin, with envelope response types:

    ```typescript
    @ApiTags('Auth')
    @Controller('auth')
    export class AuthController {
      constructor(private readonly authService: AuthService) {}

      @Public()
      @Post('login')
      @HttpCode(200)
      @ApiOperation({ summary: 'Login', operationId: 'authLogin' })
      @ApiOkResponse({ type: AuthLoginResponseDto }) // envelope, matches the wire
      login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
      }

      @Get('me')
      @ApiBearerAuth()
      @ApiOperation({ summary: 'Current user', operationId: 'authGetMe' })
      @ApiOkResponse({ type: UserEnvelopeDto }) // envelope, matches the wire
      me(@CurrentUser() user: AuthUser) {
        return this.authService.me(user?.id);
      }
    }
    ```

    Service bodies stubbed, returning the **inner** shape (the interceptor adds the envelope):

    ```typescript
    // TODO: implement — findByEmail, bcrypt.compare, jwtService.signAsync.
    // Returns the INNER shape only; TransformInterceptor adds { statusCode, data }.
    async login(_dto: LoginDto): Promise<AuthResultDto> {
      return { accessToken: 'stub-token', user: STUB_USER };
    }
    ```

    `me` returns `STUB_USER`. Declare `STUB_USER` once as a module-level const with a `// TODO: remove when implemented` comment.

    **DTOs are REAL** — `@ApiProperty` + class-validator on every field. `LoginDto`: `email` `@IsEmail()`, `password` `@MinLength(8)`. `AuthResultDto` / `UserResponseDto` / the envelope subclasses are **classes**, not interfaces.

13. **Common layer — REAL, minimal.**

    ```typescript
    // transform.interceptor.ts — wraps payload into { statusCode, data }
    // ~10 lines: map(data => ({ statusCode: ctx.switchToHttp().getResponse().statusCode, data }))
    ```

    This is now **contractually tied to the envelope DTOs** — if the interceptor's output shape changes, `ApiResponseDto` must change with it. Note that in a comment on both files; they are a matched pair, and the whole point of restoring the envelope is that they cannot silently drift.

    Also: `HttpExceptionFilter` normalizing errors to `{ statusCode, message, error }`.

14. **`main.ts` — REAL bootstrap.**

    ```typescript
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.enableCors({
      origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
      credentials: true,
    });
    const config = new DocumentBuilder()
      .setTitle('Training App API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));
    await app.listen(process.env.PORT ?? 3001);
    ```

15. **Standalone OpenAPI export script — REAL.** Separate from `main.ts` so codegen never needs a listening server:

    ```typescript
    // apps/api/scripts/generate-openapi.ts
    async function generate() {
      const app = await NestFactory.create(AppModule, { logger: false });
      const config = new DocumentBuilder()
        .setTitle('Training App API')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
      writeFileSync(
        join(__dirname, '..', 'openapi.json'),
        JSON.stringify(SwaggerModule.createDocument(app, config), null, 2),
      );
      await app.close();
    }
    generate()
      .then(() => process.exit(0))
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
    ```

    Script: `"openapi:generate": "ts-node scripts/generate-openapi.ts"`. `NestFactory.create` triggers `$connect()`, so Postgres must be up.

16. **Verify boot + envelope correctness.** `pnpm --filter=api build` → 0. `pnpm --filter=api dev` → "Nest application successfully started". Open `localhost:3001/api` → Swagger lists 2 auth endpoints. `POST /auth/login` from Swagger → response body is literally `{ "statusCode": 200, "data": { "accessToken": "stub-token", "user": {...} } }`, and the documented schema shows the same nesting. **Compare the two by eye — that match is the deliverable of the envelope work.** `POST /auth/login` with a 3-char password → 400 (proves the real ValidationPipe + real DTO decorators).

## Todo List

- [x] `docker-compose.yml` Postgres + `DATABASE_URL`/`JWT_SECRET` in `.env.example`
- [x] Install backend deps (no `bcrypt`)
- [x] `schema.prisma` — `User` + `Role` **only**, real fields
- [x] `prisma migrate dev --name init_user` + `prisma generate`
- [x] `PrismaService` (real `$connect`/`$disconnect`) + `@Global() PrismaModule`
- [x] `ApiResponseDto` base + `AuthLoginResponseDto` + `UserEnvelopeDto` envelope classes
- [x] Decorators: `@Public`, `@RequirePermissions`, `@CurrentUser`, `AuthUser` type
- [x] `role-permissions.ts` — real map, stub `hasPermission`
- [x] `JwtStrategy` — REAL constructor, stub `validate()`
- [x] `JwtAuthGuard` + `PermissionsGuard` — stub `canActivate`, real DI
- [x] `@Global() AccessControlModule` with ordered `APP_GUARD`s
- [x] `UsersModule` + stub `UsersService`, `exports: [UsersService]`
- [x] `AuthModule`: thin controller (2 endpoints), stub service, REAL DTOs + envelope response types
- [x] `TransformInterceptor` + `HttpExceptionFilter` (paired-with-envelope comment)
- [x] `main.ts`: ValidationPipe, CORS, Swagger
- [x] `scripts/generate-openapi.ts` + `openapi:generate` script
- [x] Boot verification + envelope shape matches documented schema

## Success Criteria

Structural / boot-level only. **No behavioral assertions** — there is no behavior.

- [x] `docker compose up -d` yields a reachable Postgres; `prisma migrate dev` applies cleanly.
- [x] `schema.prisma` contains **exactly one model (`User`) and one enum (`Role`)** — grep confirms no second `model ` line.
- [x] `pnpm --filter=api build` exits 0.
- [x] `pnpm --filter=api dev` reaches "Nest application successfully started" with **no** `.env` file present (placeholder defaults hold).
- [x] `localhost:3001/api` Swagger UI loads and lists exactly `authLogin` and `authGetMe` with expanded DTO schemas (not `unknown`).
- [x] **The documented response schema for both endpoints is the envelope** — `{ statusCode, data: {...} }` — and it matches the actual response body byte-for-byte in shape.
- [x] Calling both endpoints from Swagger returns its stub payload — HTTP 2xx, no unhandled exception.
- [x] `POST /auth/login` with a 3-char password → 400 (ValidationPipe + DTO decorators are real).
- [x] `pnpm --filter=api openapi:generate` writes `apps/api/openapi.json` containing exactly those two operationIds, and `components.schemas` contains named `AuthLoginResponseDto` + `UserEnvelopeDto` entries (proves pattern (b) produced named schemas for Orval).
- [x] `UserResponseDto` has **no** `password` field.
- [x] Grep: every stub body carries a `// TODO: implement` comment (no silent placeholders).
- [x] `AccessControlModule` registers both guards via `APP_GUARD` in JWT-then-Permissions order.
- [x] No `bcrypt` / `argon2` dependency in `apps/api/package.json`.
- [x] Grep for `course` / `Course` across `apps/api/` returns zero hits.

**Note:** the plan assumed an older Prisma API (`url` in `schema.prisma`, `prisma-client-js` generator). The installed Prisma 7.9.0 requires `prisma.config.ts` (CLI datasource config) + an explicit `@prisma/adapter-pg` driver adapter passed to `PrismaClient` at construction. `PrismaService`/`schema.prisma`/`prisma.config.ts` were adapted accordingly; verified via `prisma migrate dev`, `prisma generate`, and a live boot with `Database connected` logged.

## Risk Assessment

| #   | Risk                                                                                                                                                  | Likelihood | Impact   | Mitigation                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `JwtStrategy` constructor throws at bootstrap (`secretOrKey` undefined) → `nest start` dies, phase looks broken                                       | **High**   | **High** | Real constructor with `?? 'dev-placeholder-secret'` fallback (step 8); success criterion boots with no `.env`                                                               |
| R2  | Implementer over-delivers and writes real auth logic, repeating the V1/V2 scope error                                                                 | **High**   | **High** | Stub-vs-real table at the top is the contract; every stub carries `// TODO: implement`; success criteria assert no `bcrypt` dependency                                      |
| R3  | Implementer under-delivers and stubs a boot-critical piece (`$connect`, `super()`, module wiring) → app doesn't boot                                  | Med        | **High** | Same table marks each REAL piece with its reason; boot is a success criterion                                                                                               |
| R4  | `openapi:generate` requires a live DB (Nest bootstraps PrismaService)                                                                                 | **High**   | Med      | Documented; Docker is a stated prerequisite. Escape hatch: guard `$connect` with `if (process.env.SKIP_DB_CONNECT !== 'true')`                                              |
| R5  | Response DTOs declared as interfaces → Orval generates `unknown`                                                                                      | Med        | **High** | All response DTOs are classes with `@ApiProperty`; verified by inspecting `openapi.json`                                                                                    |
| R6  | **Envelope double-wrap** — service returns a pre-wrapped object and the interceptor wraps it again → `{statusCode,data:{statusCode,data}}`            | Med        | Med      | Services return the inner shape only; called out in step 12 + a comment on the interceptor. Caught by the byte-shape check in step 16                                       |
| R7  | **Envelope drift** — someone edits `TransformInterceptor`'s shape without updating `ApiResponseDto`, silently making every generated type wrong again | Med        | **High** | The two files carry matched-pair comments (step 13); this failure is exactly what restoring the envelope was meant to prevent, so it is called out rather than assumed away |
| R8  | `declare data:` omitted → subclass emits a runtime field initializer that shadows the base, or Swagger misses the property                            | Low        | Med      | Pattern specified literally in step 5; the documented-schema success criterion catches it                                                                                   |
| R9  | Open guards mistaken for a security posture                                                                                                           | Med        | Med      | Prominent `// TODO` in both guards; `plan.md` defers all auth explicitly                                                                                                    |
| R10 | Docker not installed / port 5432 in use                                                                                                               | Med        | Med      | Documented prerequisite; `DATABASE_URL` is the single place to change                                                                                                       |

**Rollback:** `prisma migrate reset --force` drops the schema; revert the commit. No consumers, no data.

## Security Considerations

**This phase ships an intentionally open API.** Both guards return `true`; `JwtStrategy.validate()` returns a hardcoded ADMIN-shaped user. Nothing here is a security boundary.

- Acceptable **only** because this is a local scaffold that is never deployed. Recorded as the top-line deferred item in `plan.md`.
- The root README (Phase 5) must state prominently: **do not deploy this skeleton**; implement the guards, `JwtStrategy.validate()`, and `hasPermission()` before any environment beyond localhost.
- `.env` gitignored; `.env.example` holds an obvious placeholder secret (`dev-placeholder-secret-not-for-production`) that is self-documenting as unsafe.
- Structural security decisions preserved for the implementer: deny-by-default guard registration (global `APP_GUARD`), `forbidNonWhitelisted` blocking mass-assignment, **no `role` field in any request DTO**, `UserResponseDto` excludes `password` so the shape is safe the day the query becomes real, CORS restricted to the web origin.

## Next Steps

Unblocks the codegen step of Phase 3, and all of Phase 4. After this phase `openapi.json` describes two endpoints with envelope-wrapped schemas — everything the frontend needs.

## Post-completion correction (2026-07-27)

A latent bug in this phase's `PrismaService` was found and fixed during `plans/260727-1500-base-template-hardening`'s Phase 1 verification: `process.env.DATABASE_URL` was never actually populated at runtime (`ConfigModule.forRoot()` doesn't mutate global `process.env` for direct readers), so `PrismaService` silently fell back to an unrelated Postgres instance on this machine. Invisible throughout this phase because every stub method never issued a real query. Fixed by adding `import 'dotenv/config'` as the first import in `apps/api/src/main.ts`. See `plans/260727-1500-base-template-hardening/phase-01-exception-filter-and-health-module.md` for the full root-cause writeup, and its `plan.md` for the summary. This phase's original success criteria (boot succeeds, migrate applies, envelope shape matches) all remained true throughout — they never depended on a real query running, which is exactly why the bug stayed hidden.
