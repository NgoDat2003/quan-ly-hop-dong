---
phase: 1
title: Env and shutdown baseline
status: completed
priority: P1
effort: 30m
dependencies: []
---

# Phase 1: Env and shutdown baseline

## Overview

Tạo `.env.example` ở root (đúng vị trí README đã tham chiếu), thêm `NODE_ENV` vào zod schema validate, và bật graceful shutdown cho Nest app để `PrismaService.onModuleDestroy` thực sự được gọi khi container nhận `SIGTERM`/`SIGINT`.

## Key Insights (từ brainstorm)

- README dòng 24 ghi `cp .env.example apps/api/.env` — nghĩa là file nguồn `.env.example` phải ở **root repo**, không phải `apps/api/`.
- `git check-ignore -v .env.example` trả về exit 1 (không match rule nào) → không bị gitignore, file chỉ đơn giản chưa tồn tại. Không phải chủ ý.
- `DATABASE_URL` KHÔNG thuộc `envSchema` (zod) vì `PrismaService` đọc `process.env.DATABASE_URL` trực tiếp qua `@prisma/adapter-pg`, không qua `ConfigService` — nhưng vẫn phải xuất hiện trong `.env.example` vì Docker/Prisma cần nó để boot.
- `NODE_ENV` hiện KHÔNG có trong `env.schema.ts` dù logic phân prod/dev (cần cho Phase 2) phụ thuộc vào nó — đây là gap cần vá trước khi Phase 2 dùng được.
- `PrismaService` đã có `onModuleDestroy` sẵn (xác nhận qua scout) — chỉ thiếu `app.enableShutdownHooks()` ở phía Nest để lifecycle hook được kích hoạt lúc nhận signal.

## Requirements

- Functional: `.env.example` liệt kê đủ biến app thật sự đọc (đối chiếu `env.schema.ts` + `docker-compose.yaml`), không thêm biến thừa không dùng.
- Functional: App tắt gọn gàng khi nhận `SIGTERM`/`SIGINT`, Prisma connection được đóng qua `onModuleDestroy` thay vì bị cắt đột ngột.
- Non-functional: Không phá vỡ khả năng boot khi hoàn toàn không có file `.env` — mọi biến optional giữ default hiện có (nguyên tắc đã ghi trong `env.schema.ts` comment).

## Architecture

Không có thay đổi kiến trúc — chỉ bổ sung 1 dòng bootstrap (`main.ts`) và 1 field zod (`env.schema.ts`), cộng 1 file tài liệu tĩnh (`.env.example`). Không tạo module mới.

## Related Code Files

- Create: `.env.example` (root)
- Modify: `apps/api/src/config/env.schema.ts` (thêm `NODE_ENV`)
- Modify: `apps/api/src/main.ts` (thêm `app.enableShutdownHooks()`)

## Implementation Steps

1. Tạo `.env.example` ở root với nội dung:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/create_project_from_template
   JWT_SECRET=dev-placeholder-secret
   JWT_EXPIRES_IN=7d
   PORT=3001
   WEB_ORIGIN=http://localhost:3000
   NODE_ENV=development
   ```
   Giá trị khớp default hiện có trong `env.schema.ts` và `docker-compose.yaml` (user/password/db/port `5433`).
2. Sửa `apps/api/src/config/env.schema.ts`: thêm field `NODE_ENV: z.enum(['development', 'production', 'test']).default('development')` vào `envSchema`. Giữ nguyên comment convention hiện có (giải thích mỗi field optional có default khớp fallback code).
3. Sửa `apps/api/src/main.ts`: thêm `app.enableShutdownHooks();` ngay sau `NestFactory.create(AppModule)` (trước các `app.use*` khác, không quan trọng thứ tự chính xác nhưng đặt sớm cho rõ ý).
4. Chạy `pnpm --filter=api check-types` và `pnpm --filter=api build` để xác nhận không có lỗi biên dịch.
5. Verify thủ công: `pnpm --filter=api dev`, sau đó gửi `SIGTERM` (Ctrl+C trên terminal chạy watch) — quan sát log Nest có in lifecycle shutdown (hoặc ít nhất không crash/hang).

## Success Criteria

- [ ] `.env.example` tồn tại ở root, `cp .env.example apps/api/.env` từ README chạy được thật (không còn lệnh chạy vào file không tồn tại).
- [ ] `NODE_ENV` xuất hiện trong `envSchema`, `validateEnv()` không throw khi thiếu biến này (default `development`).
- [ ] `app.enableShutdownHooks()` có trong `main.ts`.
- [ ] `pnpm --filter=api build` và `pnpm --filter=api check-types` pass.
- [ ] App vẫn boot được khi không có file `.env` nào tồn tại (test bằng cách rename tạm `apps/api/.env` rồi chạy `pnpm --filter=api dev`, xác nhận không crash, sau đó rename lại).

## Risk Assessment

- Rủi ro thấp — thay đổi nhỏ, không đụng logic nghiệp vụ. Rủi ro duy nhất là quên rename `.env` lúc test và để lộ trạng thái thiếu file cho dev khác — nhắc rollback ngay sau bước verify.

## Security Considerations

`.env.example` chỉ chứa giá trị dev placeholder (`dev-placeholder-secret`, user/password `postgres`/`postgres` local-only) — không phải secret thật, an toàn để commit. Không copy giá trị từ `apps/api/.env` thật (nếu người review đã tạo) vào file này.
