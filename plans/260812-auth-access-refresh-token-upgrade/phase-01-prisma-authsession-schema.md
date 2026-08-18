---
phase: 1
title: Prisma AuthSession Schema
status: completed
priority: P1
effort: 1h
dependencies: []
---

# Phase 1: Prisma AuthSession Schema

## Overview
Thêm model `AuthSession` vào Prisma schema để lưu refresh session per-device, cho phép revoke/rotate thật (không phải stateless JWT). Nền tảng bắt buộc trước khi phase 2 (backend service) có thể triển khai.

**[Red Team 2026-08-12]** Schema dưới đây đã thêm `@@index([expiresAt])` (cleanup query sau này) so với bản gốc — Phase 2 dùng compare-and-swap trực tiếp trên `id`+`refreshTokenHash` hiện có, không cần thêm cột version riêng.

## Requirements
- Functional: mỗi lần login tạo 1 row `AuthSession`; row lưu hash của refresh token (không lưu raw token); có thể đánh dấu `revokedAt` để vô hiệu hóa; quan hệ tới `User` xóa cascade khi user bị xóa.
- Non-functional: index trên `userId` (dùng cho `revokeAllUserSessions`); **[Red Team] index trên `expiresAt`** (dùng cho cleanup job tương lai — không có index này, mọi query dọn session hết hạn sẽ full table scan); migration phải chạy được idempotent qua `prisma migrate dev`.

## Architecture
`AuthSession` là bảng độc lập, không đụng tới schema `User` hiện có ngoài quan hệ 1-nhiều (`User` 1 — n `AuthSession`). Không tái sử dụng bảng `User` để lưu refresh token (khác thiết kế cũ chỉ có 1 access token không session).

## Related Code Files
- Modify: `apps/api/prisma/schema.prisma`

## Implementation Steps
1. Mở `apps/api/prisma/schema.prisma`, thêm quan hệ ngược trên `User`:
   ```prisma
   model User {
     id        String   @id @default(cuid())
     email     String   @unique
     password  String
     name      String
     role      Role     @default(TRAINEE)
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt

     authSessions AuthSession[]
   }
   ```
2. Thêm model mới ngay sau `User`:
   ```prisma
   model AuthSession {
     id               String    @id @default(cuid())
     userId           String
     user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
     refreshTokenHash String
     expiresAt        DateTime
     revokedAt        DateTime?
     ipAddress        String?
     userAgent        String?
     lastUsedAt       DateTime  @default(now())
     createdAt        DateTime  @default(now())

     @@index([userId])
     @@index([expiresAt])
   }
   ```
3. Chạy `pnpm --filter=api prisma:migrate` (tạo migration mới, đặt tên rõ ràng khi CLI hỏi, ví dụ `add_auth_session`).
4. Chạy `pnpm --filter=api prisma:generate` nếu migrate không tự generate client (theo README hiện có, `prisma:migrate` thường đã tự làm — verify output).
5. Verify: mở `apps/api/src/generated/prisma/models/` — phải xuất hiện file model `AuthSession` mới.

## Success Criteria
- [x] `apps/api/prisma/schema.prisma` có model `AuthSession` + quan hệ `User.authSessions`
- [x] Migration mới tồn tại trong `apps/api/prisma/migrations/` (`20260812072155_add_auth_session`), áp dụng thành công vào DB local
- [x] Prisma Client generate ra type `AuthSession` dùng được trong TypeScript (verify: `apps/api/src/generated/prisma/models/AuthSession.ts` tồn tại)
- [x] `pnpm --filter=api check-types` pass

## Risk Assessment
- Rủi ro thấp — bảng mới, không sửa bảng cũ ngoài thêm quan hệ ngược (không phá dữ liệu hiện có).
- Nếu Postgres local chưa chạy (`docker compose up -d`), migrate sẽ fail kết nối — không phải lỗi schema, chỉ cần khởi động DB trước.
