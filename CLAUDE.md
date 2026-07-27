# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Tham chiếu chi tiết**: Xem [`.agent/projectRules/frontend-architecture.md`](./.agent/projectRules/frontend-architecture.md) để biết đầy đủ patterns, code samples, và checklists về kiến trúc frontend.
> **Quy tắc cấp monorepo/tooling** (Docker, .gitignore, vòng đời `plans/`/`docs/journals/`, baseline security): xem [`.agent/projectRules/base-template-conventions.md`](./.agent/projectRules/base-template-conventions.md).

---

## Project Overview

| Property | Value |
|----------|-------|
| **Architecture** | Monorepo với Turborepo |
| **Package Manager** | pnpm |
| **Node Version** | >= 18 |

### Apps Structure

```
.
├── apps/
│   ├── web/                  # Next.js App Router SPA (frontend)
│   └── api/                  # NestJS REST API (backend)
└── packages/
    ├── eslint-config/         # ESLint configurations
    └── typescript-config/     # TypeScript configurations
```

---

## Tech Stack

### Frontend (`apps/web`)

| Category | Technology |
|----------|------------|
| Core | **Next.js (App Router)** + **React 19** |
| Data Fetching | **TanStack Query 5** |
| State | Không có state library riêng — local `useState`/`useMemo` + React Query cache. Chỉ thêm Zustand/Redux nếu feature thật sự cần state chia sẻ phức tạp ngoài server cache (xem "Kiến trúc Frontend" bên dưới) |
| UI | **shadcn/ui** (Radix UI + Tailwind CSS) |
| API Contract | **Orval** — tự sinh fetch function + React Query hooks từ OpenAPI JSON của backend (KHÔNG viết tay DTO/service layer) |
| Testing | Jest (kế thừa cấu hình workspace) |

### Backend (`apps/api`)

| Category | Technology |
|----------|------------|
| Framework | **NestJS** |
| Database | **PostgreSQL + Prisma** |
| Auth | **JWT + Passport** (global guard đăng ký qua `AccessControlModule` `@Global()`, `@RequirePermissions()`, `@Public()` decorators — xem "Kiến trúc Backend" bên dưới) |
| Validation | **class-validator** |
| API Docs | **Swagger**, đồng thời là nguồn sinh OpenAPI JSON cho Orval ở frontend |
| Testing | **Jest** |

---

## CRITICAL: API Contract qua Orval (không phải package DTO viết tay)

> [!CAUTION]
> Backend là nguồn chân lý duy nhất cho API contract. Frontend KHÔNG viết tay DTO/type cho request/response — toàn bộ được **Orval tự sinh** từ OpenAPI JSON của backend.

```bash
# Backend sinh OpenAPI JSON (Swagger) trước
# Frontend chạy Orval để sinh lại client
```

- Generated layer (`apps/web/lib/api/generated/`) **BẤT KHẢ XÂM PHẠM** — không sửa tay dưới bất kỳ hình thức nào.
- Mọi thay đổi request/response PHẢI bắt đầu từ backend (DTO + Swagger decorator), sau đó chạy lại Orval để đồng bộ frontend.
- Custom fetch mutator (`apps/web/lib/api/http-client.ts`) là nơi DUY NHẤT chỉnh auth header, error handling, base URL — không tạo thêm lớp HTTP client song song.
- Generated hooks đã tích hợp sẵn TanStack Query (`useQuery`/`useMutation`) — không viết lại wrapper React Query thủ công quanh chúng.

---

## Kiến trúc Frontend: Tách UI khỏi Action/Side-effect

Nguyên tắc bắt buộc cho mọi feature FE mới: component chỉ render, side-effect (mutation, toast, invalidate, redirect) tách vào `features/{feature}/hooks/use-{feature}-actions.ts`, giới hạn 300 dòng/file, pure logic tách riêng có test.

**Chi tiết đầy đủ (feature structure, ví dụ trước/sau, Pure Store pattern nếu dùng Zustand, checklist): xem [`.agent/projectRules/frontend-architecture.md`](./.agent/projectRules/frontend-architecture.md).**

---

## Kiến trúc Backend: Tách Service Theo Trách Nhiệm

Nguyên tắc bắt buộc: controller mỏng (không business logic), service vượt **500 dòng HOẶC inject hơn 6 dependency** thì tách thành sub-service `services/{name}-read|workflow|shared.service.ts` orchestrate qua facade mỏng, **không inject `PrismaService` trực tiếp trong service của module khác để query bảng ngoài phạm vi** — inject Service đã export.

**Chi tiết đầy đủ (module structure, ví dụ trước/sau tách cross-module coupling, khi nào dùng event-driven, checklist): xem [`.agent/projectRules/backend-architecture.md`](./.agent/projectRules/backend-architecture.md).**

---

## Feature Module Structure

### Frontend Feature

Xem [`.agent/projectRules/frontend-architecture.md`](./.agent/projectRules/frontend-architecture.md) — cấu trúc đầy đủ `app/`, `features/{feature}/components|hooks/`, `lib/{feature}/`.

### Backend Feature

Xem [`.agent/projectRules/backend-architecture.md`](./.agent/projectRules/backend-architecture.md) — cấu trúc đầy đủ `modules/{name}/{dto,schema,services}/`.

---

## Frontend Patterns

### shadcn/ui Components

Dùng trực tiếp từ `@/components/ui/*` (sinh qua shadcn CLI), không tự dựng lại primitives layer song song.

### Form Pattern (react-hook-form + zod, theo shadcn/ui Form)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import type { CreateEntityDto } from '@/lib/api/generated/model';

const entitySchema = z.object({ name: z.string().min(1, 'Bắt buộc') });

export function EntityForm({ onSubmit }: { onSubmit: (dto: CreateEntityDto) => void }) {
  const form = useForm<CreateEntityDto>({ resolver: zodResolver(entitySchema) });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Lưu</Button>
      </form>
    </Form>
  );
}
```

Submit handler (side-effect) không xử lý trực tiếp trong form component — gọi qua `use-{feature}-actions.ts` (xem [`.agent/projectRules/frontend-architecture.md`](./.agent/projectRules/frontend-architecture.md)).

### Orval-generated Query/Mutation Pattern

```tsx
// Generated tự động — KHÔNG viết tay, chỉ dùng
import { useFeatureListFeatures, useFeatureCreateFeature } from '@/lib/api/generated/maycha';

// Dùng trong features/{feature}/hooks/use-{feature}-actions.ts, KHÔNG dùng trực tiếp trong component lớn kèm side-effect
```

### API Contract Layer

```
lib/api/
├── generated/           # Orval output — KHÔNG sửa tay
│   ├── {name}.ts         # Fetch function + React Query hooks
│   └── model/             # DTO/enum types
└── http-client.ts        # Custom fetch mutator — auth, error handling, base URL
```

---

## Backend Patterns

### Auth & Permissions

Guard đăng ký global qua `AccessControlModule` (`@Global()`, `APP_GUARD` cho `JwtAuthGuard` + `PermissionsGuard`) — không cần `@UseGuards()` thủ công trên controller. Chi tiết đầy đủ: xem [`.agent/projectRules/backend-architecture.md`](./.agent/projectRules/backend-architecture.md).

- `@Public()` — skip auth cho route công khai (login, health check)
- `@RequirePermissions('resource:action')` — yêu cầu permission cụ thể (vd: `'entity:create'`, `'entity:delete'`)
- `@CurrentUser()` — lấy user hiện tại từ request đã authenticate

### Controller Pattern

```typescript
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { CreateEntityDto, GetEntitiesDto } from './dto/entity.dto';

@ApiTags('Entities')
@ApiBearerAuth()
@Controller('entities')
export class EntitiesController {
  constructor(private readonly service: EntitiesService) {}

  @Post()
  @RequirePermissions('entity:create')
  @ApiOperation({ summary: 'Create entity', operationId: 'entityCreateEntity' })
  async create(@Body() dto: CreateEntityDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll(@Query() query: GetEntitiesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
```

Đặt `operationId` tường minh cho endpoint quan trọng — đây là tên hàm/hook mà Orval sẽ sinh ra ở frontend, nên cần ổn định và dễ đọc.

### Service Pattern (Prisma)

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EntitiesService {
  private readonly logger = new Logger(EntitiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: GetEntitiesDto) {
    const { limit = 10, offset = 0, search } = query;
    const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};
    const [data, total] = await Promise.all([
      this.prisma.entity.findMany({ where, skip: offset, take: limit }),
      this.prisma.entity.count({ where }),
    ]);
    return { data, meta: { total, limit, offset, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }
    return entity;
  }
}
```

`PrismaService` (extends `PrismaClient`, `onModuleInit`/`onModuleDestroy`) đăng ký trong `PrismaModule` `@Global()`, inject trực tiếp — không cần repository layer trung gian.

Nếu service này (hoặc bất kỳ service nào) vượt 500 dòng hoặc phải inject Service của nhiều module khác — xem [`.agent/projectRules/backend-architecture.md`](./.agent/projectRules/backend-architecture.md) để tách theo pattern `-read/-workflow/-shared`.

### ValidationPipe (Global)

`whitelist: true` và `forbidNonWhitelisted: true` cấu hình global trong `main.ts`:
- Properties không có trong DTO bị **strip** (whitelist)
- Extra properties gây **400 error** (forbidNonWhitelisted)
- Khi dùng `UpdateDto` (partial), KHÔNG gửi field không định nghĩa trong DTO

---

## API Response Format

```typescript
// Success
{ statusCode: 200, data: T | T[], message?: string, meta?: { offset, limit, total, totalPages } }

// Error
{ statusCode: number, message: string, error: string }
```

---

## Development Commands

```bash
# Install
pnpm install

# Dev all apps
pnpm dev

# Build
pnpm build

# Lint & Format
pnpm lint
pnpm format

# Type check frontend
pnpm --filter=web check-types

# Tests
pnpm test                            # All tests
pnpm --filter=web test               # Frontend
pnpm --filter=api test               # Backend

# API contract: sinh OpenAPI JSON rồi sinh lại Orval client
pnpm codegen                         # codegen:api (openapi:generate) -> codegen:web (orval)
```

---

## New Feature Checklist

### Frontend
- [ ] `page.tsx` chỉ render, không business logic, không gọi Orval hook trực tiếp kèm side-effect
- [ ] Component UI trong `features/{feature}/components/`
- [ ] Side-effect (mutation, toast, invalidate, redirect) trong `features/{feature}/hooks/use-{feature}-actions.ts`
- [ ] Pure logic + mapper trong `lib/{feature}/`, kèm `.spec.ts` nếu có thể
- [ ] Cấu hình bảng/cột tách file `-columns.ts` riêng nếu component vượt 300 dòng
- [ ] Dùng type/hook từ `lib/api/generated/`, không tự viết tay DTO/service trùng lặp

### Backend
- [ ] Module trong `modules/{name}/`
- [ ] Controller mỏng, business logic nằm ở service
- [ ] Nếu service vượt 500 dòng hoặc >6 dependency — tách `services/{name}-read|workflow|shared.service.ts`
- [ ] DTO trong `modules/{name}/dto/`, có Swagger decorator đầy đủ (required/optional, enum, nested, response schema)
- [ ] `operationId` tường minh cho endpoint quan trọng
- [ ] Không inject `PrismaService` để query trực tiếp bảng của module khác — inject Service đã export
- [ ] Sau khi đổi schema Prisma: chạy `prisma migrate dev` rồi `pnpm codegen` để đồng bộ frontend

---

## Common Mistakes to Avoid

| Category | Don't | Do |
|----------|-------|-----|
| **API Contract** | Viết tay DTO/type ở frontend | Dùng type sinh từ `lib/api/generated/model` |
| **API Contract** | Sửa tay file trong `lib/api/generated/` | Sửa DTO/Swagger ở backend, chạy lại `pnpm codegen` |
| **Component** | Gọi mutation + toast + invalidate + redirect trực tiếp trong component | Tách vào `features/{feature}/hooks/use-{feature}-actions.ts` |
| **Component** | Định nghĩa `ColumnDef` dài inline trong page | Tách file `{feature}-columns.ts` riêng |
| **File size** | File vượt 300 dòng không lý do | Tách theo UI/action/pure-logic; ngoại lệ phải có ghi chú |
| **API** | Hard-code URL | Dùng base URL/config tập trung trong `lib/api/http-client.ts` |
| **Cache** | Quên invalidate sau mutation | `queryClient.invalidateQueries()` trong action hook |
| **Files** | PascalCase cho file component | kebab-case: `feature-list.tsx` |
| **Backend** | Business logic trong controller | Đặt trong service |
| **Backend** | `@UseGuards(JwtAuthGuard)` thủ công | Auth đã global qua `AccessControlModule`; dùng `@RequirePermissions()` hoặc `@Public()` |
| **Backend** | Inject `PrismaService` để query bảng thuộc module khác | Inject Service đã export của module đó |
| **Backend** | Service phình to không giới hạn | Tách `-read/-workflow/-shared` khi vượt 500 dòng hoặc >6 dependency |
| **Backend** | Send extra fields in Update DTO | Only send fields defined in `UpdateDto` (forbidNonWhitelisted) |

---

## References

- **Kiến trúc Frontend chi tiết**: [`.agent/projectRules/frontend-architecture.md`](./.agent/projectRules/frontend-architecture.md)
- **Kiến trúc Backend chi tiết**: [`.agent/projectRules/backend-architecture.md`](./.agent/projectRules/backend-architecture.md)
- **API Docs**: Swagger UI (dev only)
