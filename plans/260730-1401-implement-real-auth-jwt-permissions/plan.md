---
title: 'Implement real JWT auth, permission checks, and seed script'
description: >-
  Thay 5 chỗ auth stub (JwtAuthGuard, PermissionsGuard, JwtStrategy,
  hasPermission, UsersService/AuthService) bằng logic thật, kèm seed script và
  test boundary bắt buộc
status: completed
priority: P1
branch: main
tags:
  - backend
  - auth
  - security
blockedBy: []
blocks: []
created: '2026-07-30T07:06:45.343Z'
createdBy: 'ck:plan'
source: skill
---

# Implement real JWT auth, permission checks, and seed script

## Overview

Từ brainstorm session ([reports/brainstorm-report.md](./reports/brainstorm-report.md)) + 2 researcher report (JWT/bcrypt best practice, NestJS guard testing pattern): base template `apps/api` có 5 chỗ auth cố ý để stub (README cảnh báo rõ, đặc biệt `JwtStrategy.validate()` hardcode `role: 'ADMIN'` cho MỌI JWT hợp lệ — bẫy nguy hiểm nhất). Plan này thay toàn bộ bằng logic thật, kèm seed script tạo admin đầu tiên và test boundary chứng minh guard thực sự chặn request (không chỉ "endpoint trả 200").

Đây là follow-up của round infra hardening trước (`plans/260729-0923-infra-hardening-logging-env-shutdown/`, đã done). AppShell (gap lớn nhất so với `maycha_QAQC_app`) là plan RIÊNG, làm SAU khi plan này merge + test pass — không gộp vì auth là security-critical, AppShell là UI, rủi ro khác loại.

## Quyết định chốt qua research + AskUserQuestion

- **Hash password: `bcryptjs`** (không phải `bcrypt` native) — máy dev hiện tại xác nhận không có MSVC build tools (`cl.exe`), cài `bcrypt` native sẽ fail. `bcryptjs` thuần JS, không cần build tool, phù hợp mục tiêu "clone base chạy được ngay" của skeleton.
- **JWT payload chỉ chứa `sub` (user id)**, không nhét role/email — `JwtStrategy.validate()` tra DB tươi mỗi request (codebase đã đúng hướng này từ đầu, chỉ cần bỏ hardcode).
- **Không làm refresh token** — YAGNI, base chưa có logout UI để justify. Single `JWT_EXPIRES_IN=7d` giữ nguyên.
- **Không thêm endpoint `POST /auth/register`** — dùng seed script thay vì public registration.
- **Seed đơn giản, không tách `SeederModule` riêng** — research đề xuất `SeederModule` tách biệt, nhưng base này nhỏ (4 module), theo tinh thần KISS đã áp dụng round trước: viết 1 script gọn dùng `NestFactory.createApplicationContext(AppModule)` trực tiếp, không thêm module mới chỉ để seed.
- **Test: integration test qua `Test.createTestingModule` + supertest, JWT thật, mock Prisma/UsersService** — không mock guard, không mock Passport internals. Bắt buộc chứng minh: không token → 401, user không tồn tại trong DB → 401 (chính là lỗi hardcode ADMIN cũ), sai permission → 403, `@Public()` bypass đúng.
- **Timing attack mitigation**: dummy `bcryptjs.compare()` khi user không tồn tại, tránh lộ email nào có tồn tại qua response time.

## Red Team Review

4 reviewer song song (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic) — 28 finding thô, sau khử trùng lặp áp dụng các fix chính:

- **Guard order phân loại lại** (Phase 2): `JwtAuthGuard`→`PermissionsGuard` deterministic (cùng module/array), `ThrottlerGuard`→`AccessControlModule` KHÔNG có guarantee — thêm bước verify thật (3/4 reviewer độc lập cùng phát hiện, code comment ở `app.module.ts` đã tự yêu cầu điều này).
- **Seed script vị trí sai** (Phase 4): chuyển từ `src/scripts/` sang `apps/api/scripts/` (khớp `generate-openapi.ts`), bỏ `tsconfig-paths` (không tồn tại trong deps), thêm `{logger: false}` + `process.exit(0)`.
- **Security hardening rẻ** (Phase 3, 4 — chốt qua AskUserQuestion): `JWT_SECRET` production guard trong `env.schema.ts`, `@MaxLength(72)` cho `LoginDto.password`, seed script từ chối chạy khi `NODE_ENV=production`.
- **Type reuse** (Phase 1): dùng Prisma-generated `User` type thay vì tự định nghĩa `UserWithPassword`.
- **Test suite gọn hơn** (Phase 5): gộp 2 spec file guard thành 1 (`access-control.integration.spec.ts`), bỏ `jwt.strategy.spec.ts` riêng (trùng lặp coverage với integration test), thêm test case `@Public()`+`@RequirePermissions()` cùng lúc và test case guard order thật. Bổ sung mock `PrismaService` tường minh (không chỉ `UsersService`) — `AccessControlModule`/`PrismaModule` đều `@Global()`, thiếu mock sẽ cố kết nối DB thật khi test.
- **Docs sync mở rộng** (Phase 7): thêm cập nhật dòng `README.md:90` (mô tả test suite cũ không còn đúng sau Phase 5).

Không áp dụng: rate-limit riêng cho `/auth/login` (để dự án cụ thể tự tuning theo threat model thật), refresh token (đã quyết YAGNI từ đầu).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Password hashing and UsersService](./phase-01-password-hashing-and-usersservice.md) | Completed |
| 2 | [JWT strategy and guards](./phase-02-jwt-strategy-and-guards.md) | Completed |
| 3 | [Login flow and permission checks](./phase-03-login-flow-and-permission-checks.md) | Completed |
| 4 | [Seed script](./phase-04-seed-script.md) | Completed |
| 5 | [Boundary tests](./phase-05-boundary-tests.md) | Completed |
| 6 | [Frontend token flow](./phase-06-frontend-token-flow.md) | Completed |
| 7 | [Docs sync](./phase-07-docs-sync.md) | Completed |

## Dependencies

Phase 2 phụ thuộc Phase 1 (`UsersService.findById` thật cần có trước `JwtStrategy.validate()` gọi nó). Phase 3 phụ thuộc Phase 1+2 (login cần `UsersService.findByEmail` + guard đã có `hasPermission` thật). Phase 4 phụ thuộc Phase 1 (seed cần hash password qua cùng lib). Phase 5 phụ thuộc Phase 1-4 (test verify toàn bộ chuỗi thật). Phase 6 phụ thuộc Phase 3 (frontend cần API login thật trả token đúng shape). Phase 7 phụ thuộc tất cả (docs sync cuối cùng).
