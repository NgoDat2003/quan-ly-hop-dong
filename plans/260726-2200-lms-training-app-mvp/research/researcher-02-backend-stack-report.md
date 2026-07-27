---
name: backend-stack-research
description: NestJS + Prisma + PostgreSQL + JWT best-practice patterns for LMS MVP backend
metadata:
  type: research
  date: 2026-07-26
  author: researcher
---

# Backend Stack Research Report: NestJS + Prisma + PostgreSQL LMS MVP

## 1. Minimal Prisma Schema + PrismaService Pattern

### schema.prisma (MVP sketch)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  TRAINER
  TRAINEE
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(TRAINEE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  enrollments Enrollment[]
  attempts    QuizAttempt[]
}

model Course {
  id          String   @id @default(cuid())
  title       String
  description String?
  createdAt   DateTime @default(now())

  lessons Lesson[]
  enrollments Enrollment[]
}

model Lesson {
  id        String   @id @default(cuid())
  title     String
  content   String   // text or video URL
  courseId  String
  order     Int
  createdAt DateTime @default(now())

  course  Course    @relation(fields: [courseId], references: [id], onDelete: Cascade)
  quizzes Quiz[]

  @@index([courseId])
}

model Quiz {
  id       String @id @default(cuid())
  title    String
  lessonId String

  lesson    Lesson        @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  questions Question[]
  attempts  QuizAttempt[]

  @@index([lessonId])
}

model Question {
  id    String @id @default(cuid())
  text  String
  quizId String

  quiz    Quiz    @relation(fields: [quizId], references: [id], onDelete: Cascade)
  options Option[]

  @@index([quizId])
}

model Option {
  id         String  @id @default(cuid())
  text       String
  isCorrect  Boolean
  questionId String

  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@index([questionId])
}

model QuizAttempt {
  id        String   @id @default(cuid())
  userId    String
  quizId    String
  score     Float
  createdAt DateTime @default(now())

  user User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  quiz Quiz  @relation(fields: [quizId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([quizId])
}

model Enrollment {
  id        String   @id @default(cuid())
  userId    String
  courseId  String
  progress  Int      @default(0) // %
  createdAt DateTime @default(now())

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([userId, courseId])
  @@index([userId])
  @@index([courseId])
}
```

### PrismaModule + PrismaService

```typescript
// prisma/prisma.service.ts
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
    this.logger.log('Database disconnected');
  }
}

// prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

---

## 2. Access Control Module with JWT + Passport + Global Guards

### JwtAuthGuard + PermissionsGuard (APP_GUARD)

```typescript
// access-control/guards/jwt-auth.guard.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    if (err || !user) throw err || new UnauthorizedException();
    return user;
  }
}

// access-control/guards/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('No user in request');

    // Map Role to permissions: admin=all, trainer/trainee=limited
    const userPermissions = this.getPermissionsForRole(user.role);
    const hasPermission = requiredPermissions.some((perm) => userPermissions.includes(perm));
    if (!hasPermission) throw new ForbiddenException('Insufficient permissions');

    return true;
  }

  private getPermissionsForRole(role: string): string[] {
    const rolePermissions: Record<string, string[]> = {
      ADMIN: ['*'],
      TRAINER: ['course:create', 'course:update', 'lesson:create', 'quiz:create', 'quiz:grade'],
      TRAINEE: ['enrollment:create', 'quiz:attempt', 'progress:read'],
    };
    return rolePermissions[role] || [];
  }
}
```

### Decorators

```typescript
// access-control/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

// access-control/decorators/require-permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const REQUIRE_PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

// access-control/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user;
});
```

### Global Registration in AccessControlModule

```typescript
// access-control/access-control.module.ts
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AccessControlModule {}
```

---

## 3. Swagger OpenAPI JSON Export + operationId for Orval

### Swagger Config + Export Script

```typescript
// main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('LMS API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Export JSON for Orval
  const fs = await import('fs');
  fs.writeFileSync('dist/openapi.json', JSON.stringify(document, null, 2));

  await app.listen(3000);
}
bootstrap();
```

### operationId in Controller (affects Orval hook naming)

```typescript
// courses/courses.controller.ts
@ApiOperation({
  summary: 'Create course',
  operationId: 'courseCreateCourse'  // Orval generates useCourseCourseCreate() from this
})
@Post()
@RequirePermissions('course:create')
async create(@Body() dto: CreateCourseDto) {
  return this.service.create(dto);
}
```

**operationId Impact**: Orval generates hook name from camelCase(operationId), prefixed with `use`, so `courseCreateCourse` → `useCourseCreateCourse`. Explicit operationId ensures stable generated names across frontend regenerations.

---

## 4. Module Boundaries & Prisma Injection Pattern

**Recommended Pattern (No Repository Layer for MVP)**:

- PrismaService injected directly into feature services (not controllers).
- Services encapsulate business logic + Prisma queries.
- Other modules import feature service via exports, NOT PrismaService directly.

**Example**:

```typescript
// courses/courses.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';

@Module({
  imports: [PrismaModule],
  providers: [CoursesService],
  controllers: [CoursesController],
  exports: [CoursesService], // Export service, not PrismaService
})
export class CoursesModule {}

// courses/courses.service.ts
@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.course.findMany({ include: { lessons: true } });
  }
}

// enrollments/enrollments.service.ts — cross-module injection
import { CoursesService } from '../courses/courses.service';
@Injectable()
export class EnrollmentsService {
  constructor(private coursesService: CoursesService) {}
  // Use coursesService, not PrismaService directly
}
```

**Boundary Enforcement**: Modules export only Services (not PrismaService). If a module needs data from another module's tables, it calls that module's service. No cross-module PrismaService injection.

---

## 5. Pitfalls & Best Practices

| Pitfall                                  | Mitigation                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| **PrismaService lifetime issues**        | Use OnModuleInit/OnModuleDestroy; never new PrismaClient() in services                 |
| **Cross-module PrismaService injection** | Export feature services only; other modules import services, not PrismaService         |
| **operationId instability**              | Set explicit operationId in @ApiOperation; document URL when it changes                |
| **Missing @Global() on PrismaModule**    | PrismaModule must be @Global(), else each module gets separate PrismaService instances |
| **Migrations blocking tests**            | Run `prisma migrate reset` in test teardown or CI before e2e tests                     |
| **Prisma client disconnect**             | Seed script must `.then(...).finally(() => prisma.$disconnect())`                      |

---

## Stack Versions & Sources

- **NestJS**: ^10.x (LTS), [NestJS Docs](https://docs.nestjs.com/recipes/prisma)
- **Prisma**: ^5.x / ^6.x, [Prisma NestJS Guide](https://www.prisma.io/docs/guides/frameworks/nestjs)
- **Passport**: ^0.7.x, [@nestjs/passport](https://docs.nestjs.com/techniques/authentication)
- **JWT**: [@nestjs/jwt](https://docs.nestjs.com/techniques/authentication#jwt-functionality)
- **Swagger**: [@nestjs/swagger](https://docs.nestjs.com/openapi/introduction)
- **PostgreSQL**: ^12+ (via Prisma datasource)

---

## Unresolved Questions

1. **Orval regeneration frequency**: Should codegen run on every build or only when schema changes? Recommend: hook into `build:api` script to auto-export OpenAPI JSON before Orval runs.
2. **Permission model granularity**: Role-based (admin/trainer/trainee) vs. resource-level ACL. MVP uses role-based; escalate if fine-grained permissions needed later.
3. **Soft deletes**: Should quiz/lesson deletions cascade or soft-delete? Current schema cascades; if audit trail needed, add `deletedAt` field to models.
