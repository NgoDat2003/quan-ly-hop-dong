---
title: 'Auth Upgrade: Access+Refresh Token via httpOnly Cookie'
description: ''
status: completed
priority: P2
branch: main
tags: []
blockedBy: []
blocks: []
created: '2026-08-12T06:51:07.017Z'
createdBy: 'ck:plan'
source: skill
---

# Auth Upgrade: Access+Refresh Token via httpOnly Cookie

## Overview

Base template hiện chỉ có 1 access token JWT (7 ngày), lưu `localStorage`, gửi qua `Authorization: Bearer`, không revoke được. Nâng cấp lên access+refresh token qua httpOnly cookie, session tracking trong Postgres (`AuthSession`) để revoke/rotate thật, đổi bcrypt sang argon2. Đây là chuẩn mặc định mới cho MỌI dự án tương lai clone từ base này — không phải fix riêng 1 dự án.

Design nguồn: [`plans/reports/260812-brainstorm-auth-access-refresh-token-upgrade.md`](../reports/260812-brainstorm-auth-access-refresh-token-upgrade.md) — mọi quyết định lớn (cookie vs localStorage, DB session vs stateless, argon2 vs bcrypt, không SSO, không audit log) đã chốt ở đó qua AskUserQuestion, không lặp lại lý do ở đây.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Prisma AuthSession Schema](./phase-01-prisma-authsession-schema.md) | Completed |
| 2 | [Backend Session Service and Cookie Auth](./phase-02-backend-session-service-and-cookie-auth.md) | Completed |
| 3 | [Argon2 Password Hashing](./phase-03-argon2-password-hashing.md) | Completed |
| 4 | [Frontend Cookie Migration](./phase-04-frontend-cookie-migration.md) | Completed |
| 5 | [Test Updates](./phase-05-test-updates.md) | Completed |
| 6 | [Docs Update](./phase-06-docs-update.md) | Completed |

## Dependencies

<!-- Cross-plan dependencies -->

## Red Team Review

### Session — 2026-08-12
**Findings:** 36 tổng (từ 4 reviewer độc lập: Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic) → 12 finding riêng biệt sau khử trùng lặp
**Severity breakdown:** 3 Critical, 6 High, 3 Medium

| # | Finding | Severity | Reviewers (độc lập) | Disposition | Applied To |
|---|---------|----------|---------------------|-------------|------------|
| 1 | CSRF hoàn toàn không có mitigation — cookie xóa bỏ miễn nhiễm CSRF hiện có, `SameSite=None` do plan gốc tự đề xuất mở toang CSRF | Critical | 4/4 | Accept | Completed |
| 2 | Refresh cookie `path=/api/auth` sai thực tế — route thật `/auth/refresh`, `/api` là Swagger, cookie sẽ không bao giờ gửi kèm | Critical | 4/4 | Accept (verify bằng grep `setGlobalPrefix` — xác nhận đúng) | Completed |
| 3 | Rotate không atomic — race condition (multi-tab/parallel query) trigger nhầm "replay detected", đá user hợp lệ ra | Critical | 3/4 | Accept | Completed |
| 4 | Phase 2 gốc gỡ `JwtModule.registerAsync` global secret, phá vỡ `access-control.integration.spec.ts` (ký token qua DI, dựa vào secret global) | High | 4/4 | Accept | Completed |
| 5 | argon2 không build được trên `node:20-alpine` (musl, không toolchain) — Dockerfile chưa từng build thật, không nằm trong file list Phase 3 gốc | High | 3/4 | Accept (verify bằng đọc Dockerfile thật — xác nhận đúng) | Completed |
| 6 | Phase 4 gốc xóa hết token-handling FE nhưng không thêm auto-refresh — access token 15 phút hết hạn, user bị đăng xuất mỗi 15 phút, không có retry | High | 1/4 (logic không ai phản bác) | Accept | Completed |
| 7 | Replay detection chỉ revoke 1 session, không revoke toàn bộ family — attacker giữ token đã rotate trong khi user thật bị đá ra | High | 2/4 | Accept | Phase 2 (`revokeAllUserSessions` thay vì `revokeSession` khi replay thật), Phase 5 (assert đúng hàm được gọi) |
| 8 | Phase 6 gốc định hướng dẫn viết "đổi mật khẩu revoke toàn bộ thiết bị" — không phase nào implement change-password endpoint | High/Medium | 4/4 | Accept | Phase 6 (cấm claim này, thêm success criterion grep xác nhận không còn xuất hiện) |
| 9 | Không rate-limit riêng cho `/auth/login`/`/auth/refresh` — chỉ throttle global 100/phút, không đủ chống brute-force + DoS qua argon2 | Critical (theo 1 reviewer) | 1/4 nhưng hợp lý, không ai phản bác | Accept | Phase 2 (`@Throttle` riêng 5 req/phút), Phase 3 (pin tham số argon2 thấp hơn default để giảm tải endpoint public tần suất cao) |
| 10 | Cookie name không có single source of truth — nguy cơ lệch tên giữa các nơi định nghĩa | Medium | 2/4 | Accept | Phase 2 (file constant mới `auth-cookie.constants.ts`), Phase 5 (import thay vì hardcode trong test) |
| 11 | `AuthSession` không có index `expiresAt`, không cleanup job — bảng phình vô hạn | Medium | 2/4 | Accept | Phase 1 (thêm `@@index([expiresAt])`) |
| 12 | Phase 3 (argon2) là gold-plating rủi ro cao/lợi ích thấp cho base chưa có user thật — đề xuất cắt hẳn | High (đề xuất cắt) | 1/4 | **User quyết định: giữ Phase 3, fix Docker/Alpine thay vì cắt** | Phase 3 (xem finding #5 — cùng 1 fix giải quyết cả 2 concern) |

**Loại bỏ khi adjudicate:** claim "`sid` không validate với `sub`" (Assumption Destroyer) — đối chiếu lại thấy hash-compare đã đóng vai trò xác thực sở hữu tương đương, mức nghiêm trọng bị thổi phồng so với cơ chế thật.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-prisma-authsession-schema.md, phase-02-backend-session-service-and-cookie-auth.md, phase-03-argon2-password-hashing.md, phase-04-frontend-cookie-migration.md, phase-05-test-updates.md, phase-06-docs-update.md
- Decision deltas checked: 12 (cookie path `/api/auth`→`/auth`; `JwtModule` giữ default thay vì xóa; `revokeSession`→`revokeAllUserSessions` khi replay thật; rotate đổi tên `rotateSession`→`rotateSessionAtomic` + đổi chữ ký hàm; thêm `auth-cookie.constants.ts`; thêm Origin-check guard; thêm `@Throttle` riêng; thêm FE auto-refresh; thêm `@@index([expiresAt])`; xóa `touchSession`/`ipAddress`/`userAgent`-tracking khỏi scope; cấm claim "đổi mật khẩu revoke thiết bị"; effort re-estimate toàn bộ 6 phase)
- Reconciled stale references: Phase 5 (đồng bộ tên hàm `rotateSessionAtomic`, `revokeAllUserSessions` khớp Phase 2 mới), Phase 6 (đồng bộ không còn nhắc "đổi mật khẩu" theo Phase 2 mới không có endpoint đó)
- Unresolved contradictions: 0

Không còn xung đột giữa các phase file sau khi áp dụng toàn bộ 11 finding đã accept (finding #12 là quyết định phạm vi do user chọn, không phải bug — đã giải quyết bằng cách gộp vào fix Docker/Alpine).

## Post-Implementation Code Review

### Session — 2026-08-13
Sau khi implement xong cả 6 phase (35 test pass, verify E2E qua browser thật + Docker thật), spawn `code-reviewer` subagent review toàn bộ diff. **Score: 9/10, 0 Critical.**

Verify được (không chỉ tin claim): build sạch, 29 test pass lúc review (35 sau khi thêm fix), grep sweep xác nhận không còn `bcryptjs`/`JWT_SECRET` cũ/`app_auth_token` cũ, cả 2 bug phát hiện lúc implement (secret sai ở `access-control.module.ts`, `logout` thiếu `@Public()`) đã confirm fix đúng trong source.

**High (đã sửa):** `AUTH_COOKIE_SECURE` thiếu guard boot-time production — thêm check `NODE_ENV === 'production' && !AUTH_COOKIE_SECURE` throw, cùng pattern với guard `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` đã có.

**Medium (đã sửa):**
1. Nhánh benign-race (CAS count=0, cùng token) đang trả `401` giống hệt replay thật — lệch với ý định gốc của plan ("retry-able error, không phải 401 cứng"). Sửa: `AuthService.refresh()` đọc lại session, nếu hash mới verify được với token hiện tại (chứng minh cùng 1 token, khác request thắng race) → `ConflictException` (409); nếu không → coi là bất thường thật, revoke family + 401. FE `http-client.ts` retry refresh thêm 1 lần khi gặp 409 trước khi bỏ cuộc.
2. `OriginCheckGuard` chưa có test tự động, chỉ verify thủ công — thêm `origin-check.guard.spec.ts` (6 case: match/mismatch Origin, thiếu Origin, safe methods bypass, POST/PUT/PATCH/DELETE đều bị chặn khi mismatch).

**Low (không sửa, chấp nhận được):** rate-limit `/auth/refresh` (5/phút) có thể bị cạn nhanh hơn nếu trang tương lai có nhiều query song song cùng lúc 401 — page hiện tại (`/login`) chưa có use case này, ghi nhận cho dự án con biết khi thêm dashboard nhiều query. Build toolchain trong Dockerfile (`python3 make g++`) có thể dư thừa nếu argon2 luôn có prebuilt musl binary — giữ làm fallback, chi phí build image tăng nhẹ, chấp nhận được.

Sau fix: 35 test pass (4 suite, +1 suite mới `origin-check.guard.spec.ts`, +2 test case mới cho 409/revoke trong `auth.service.spec.ts`), type-check + build sạch cả 2 app, smoke test lại qua curl xác nhận happy-path/replay-detection/session-revoke không bị fix làm hỏng.
