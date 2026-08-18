# Bàn giao: Port Auth Upgrade (Access+Refresh Token) sang thinh-the-vinh-hoa-portal

Người nhận: AI session/dev đang làm việc trên `D:\work\maycha\thinh-the-vinh-hoa-portal`.
Người gửi: session vừa hoàn tất nâng cấp auth trên base template gốc `D:\work\maycha\create-template-project`.

## Quan hệ 2 repo (đã verify bằng git log)

`thinh-the-vinh-hoa-portal` clone từ chính base template này, chung lịch sử git tới commit `a14674e` ("feat: implement real JWT authentication, permission checks, and seed script"). Sau đó portal rẽ nhánh riêng và tự thêm:
- Microsoft SSO (`auth.controller.ts` route `/auth/microsoft-sso`, `auth.service.ts` hàm `loginWithMicrosoft()`, dùng `jwks-rsa` verify RS256 id_token)
- `User.isActive` field (base gốc không có)
- Prisma model riêng: `Category`, `AppEntry`, `SupportTicket`
- UI redesign (forest/gold theme)

**Đây KHÔNG phải merge/rebase tự động được** — 2 nhánh đã tách xa nhau về code, phải port thủ công từng phần theo hướng dẫn dưới, không copy-paste nguyên file.

## Vấn đề gốc (tại sao base template đổi)

Base template cũ chỉ có 1 access token JWT (7 ngày), lưu ở `apps/web/lib/auth/auth-token.ts` (localStorage), gửi qua `Authorization: Bearer`. Không revoke được — logout chỉ là xóa localStorage phía client, token cũ vẫn hợp lệ tới khi hết hạn tự nhiên (7 ngày).

## Đã đổi gì (bên create-template-project)

Chuyển sang access token (15 phút) + refresh token (7 ngày), cả 2 qua **httpOnly cookie**, session tracking qua bảng `AuthSession` (Postgres) cho phép revoke/rotate thật. Chi tiết đầy đủ + rationale: đọc [`plans/260812-auth-access-refresh-token-upgrade/plan.md`](../260812-auth-access-refresh-token-upgrade/plan.md) (có Red Team Review 12 finding + Post-Implementation Code Review) và 6 phase file trong cùng thư mục.

### Danh sách file đã đổi (base template)

**Backend — file mới:**
- `apps/api/src/modules/auth-sessions/` (module + service — CRUD/rotate/revoke `AuthSession`)
- `apps/api/src/modules/access-control/constants/auth-cookie.constants.ts` (tên cookie, path — single source of truth)
- `apps/api/src/common/guards/origin-check.guard.ts` (CSRF compensating control)
- `apps/api/src/common/dto/success-response.dto.ts`
- `apps/api/src/modules/auth/argon2-options.constant.ts`

**Backend — file sửa:**
- `apps/api/prisma/schema.prisma` (+model `AuthSession`, quan hệ `User.authSessions`)
- `apps/api/src/config/env.schema.ts` (`JWT_SECRET`/`JWT_EXPIRES_IN` → `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`JWT_ACCESS_TTL`/`JWT_REFRESH_TTL`/`AUTH_COOKIE_SECURE`, thêm guard boot-time production)
- `apps/api/src/modules/access-control/access-control.module.ts` (JwtModule đăng ký access secret làm default)
- `apps/api/src/modules/access-control/strategies/jwt.strategy.ts` (đọc access token từ cookie thay vì header)
- `apps/api/src/modules/auth/auth.service.ts` (thêm `refresh()`/`logout()`, `login()` trả `{ user, tokens }`, đổi bcrypt→argon2)
- `apps/api/src/modules/auth/auth.controller.ts` (set/clear cookie, route `refresh`/`logout` mới, rate-limit riêng)
- `apps/api/src/modules/auth/auth.module.ts` (import `AuthSessionsModule`)
- `apps/api/src/modules/auth/dto/auth-result.dto.ts` (bỏ `accessToken` khỏi response JSON)
- `apps/api/src/app.module.ts` (redact cookie header trong log, đăng ký `OriginCheckGuard`)
- `apps/api/src/main.ts` (`cookie-parser` middleware)
- `apps/api/Dockerfile` (node:20→22-alpine, build toolchain cho argon2, sửa `CMD` path, `pnpm deploy --legacy`)
- `apps/api/scripts/seed-admin.ts` (bcrypt→argon2)

**Frontend — file sửa/xóa:**
- `apps/web/lib/api/http-client.ts` (`credentials: 'include'`, auto-refresh-on-401, retry-on-409)
- `apps/web/features/auth/hooks/use-auth-actions.ts` (bỏ `setToken()`)
- **Xóa:** `apps/web/lib/auth/auth-token.ts`

**Test mới/sửa:**
- `apps/api/src/modules/auth/auth.service.spec.ts` (viết lại: 15 case)
- `apps/api/src/modules/access-control/access-control.integration.spec.ts` (đổi Bearer→cookie, +1 case access-token-hết-hạn)
- `apps/api/src/modules/auth-sessions/auth-sessions.service.integration.spec.ts` (MỚI — dùng Postgres thật, không mock, chứng minh CAS atomic)
- `apps/api/src/common/guards/origin-check.guard.spec.ts` (MỚI)

## Những điểm PHẢI cẩn thận khi port sang portal (khác base gốc)

1. **`loginWithMicrosoft()` cũng phải đổi giống `login()`** — cả 2 hàm cuối cùng đều gọi `issueToken(user)` (portal, dòng 170-173 file `auth.service.ts`). Khi port, sửa `issueToken()` thành `createSessionAndTokens()` kiểu access+refresh — cả login thường lẫn SSO đều tự động dùng logic mới, không cần sửa riêng từng route.
2. **`User.isActive` check phải giữ nguyên vị trí** — cả `login()` (dòng 73-75) và `loginWithMicrosoft()` (dòng 123-125) đều check `isActive` **sau khi** xác thực nhưng **trước khi** issue token. Khi port, đặt check này trước lệnh gọi `createSessionAndTokens()` mới, không xóa mất.
3. **`findOrCreateFromSso()`** — hàm này tự tạo user mới nếu SSO login lần đầu. Sau khi port, user mới tạo qua SSO cũng phải có `AuthSession` được tạo đúng (không có gì đặc biệt cần lo, chỉ cần đảm bảo path code chạy qua đúng hàm session mới).
4. **Env vars portal đã có `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`** — không đụng vào các biến này, chỉ thêm/đổi biến JWT như base gốc.
5. **`.env` thật của portal** (không phải `.env.example`) đang chạy Postgres port 5433 (đã confirm đụng port với base template lúc dev — 2 project không nên chạy Postgres cùng lúc trên máy dev, đổi port 1 trong 2 nếu cần chạy song song).
6. **KHÔNG port nguyên file `auth.controller.ts`/`auth.service.ts` từ base gốc** — portal có thêm route/logic SSO mà base gốc không có. Phải merge thủ công: giữ nguyên cấu trúc SSO của portal, chỉ thay phần token-issuing bên trong.

## Việc CHƯA làm (ngoài phạm vi, portal tự quyết định)

- Chưa test build Docker cho `apps/web` (chỉ `apps/api` đã verify build+run thật)
- Chưa có change-password endpoint (nên nếu portal thêm sau, nhớ gọi `AuthSessionsService.revokeAllUserSessions` ở đó)
- CSRF: base mặc định chỉ đủ cho same-site deploy. Nếu portal deploy FE/BE khác domain hẳn (không phải subdomain), cần tự thêm CSRF token đầy đủ ngoài `OriginCheckGuard` đã có.

## Đề xuất bước tiếp theo cho portal

1. Đọc kỹ [`plan.md`](../260812-auth-access-refresh-token-upgrade/plan.md) + 6 phase file để hiểu chi tiết implementation (không chỉ đọc tóm tắt này).
2. Chạy `/ck:scout` trong repo portal để map chính xác các điểm khác biệt so với base gốc (SSO, `isActive`, Prisma model riêng) trước khi bắt đầu port.
3. Không nên tự AI port thẳng — nên chạy `/ck:brainstorm` trong session làm việc trên portal, dẫn theo file bàn giao này, để tự thiết kế lại thứ tự port phù hợp với code portal đã rẽ nhánh (đặc biệt là chỗ SSO).
4. Test kỹ luồng SSO sau khi port — đây là phần không có trong base gốc nên không được cover bởi bất kỳ test nào của base, phải tự viết test mới cho SSO+cookie.

## Unresolved Questions

- Chưa rõ portal có đang chạy production thật hay vẫn dev — nếu production thật đã có user, cần kế hoạch migrate riêng (base gốc xóa sạch session cũ vì chưa deploy thật, portal có thể không làm được vậy).
- Chưa kiểm tra portal có UI logout thật hay chưa (base gốc chưa có UI logout vì chỉ có `/login`) — nếu portal đã có dashboard, cần thêm gọi `/auth/logout` mới vào đúng chỗ.
