---
phase: 2
title: Backend Session Service and Cookie Auth
status: completed
priority: P1
effort: 9h
dependencies:
  - 1
---

# Phase 2: Backend Session Service and Cookie Auth

## Overview
Triển khai `AuthSessionsService` (Prisma), sửa `AuthService`/`AuthController` sang phát 2 token (access+refresh) qua httpOnly cookie, thêm endpoint `/auth/refresh` và `/auth/logout`, đổi `JwtStrategy` đọc token từ cookie thay vì `Authorization` header. Port logic từ `maycha_QAQC_app` (Mongoose) sang Prisma/Postgres — xem [brainstorm report](../reports/260812-brainstorm-auth-access-refresh-token-upgrade.md) mục "Thiết kế đã chốt".

**[Red Team 2026-08-12]** Effort tăng từ 6h → 9h sau red-team review — phase này giờ gồm cả CSRF defense, atomic rotate, và fix breaking test, không chỉ happy-path cookie swap.

## Requirements
- Functional:
  - `POST /auth/login` set 2 httpOnly cookie (access, refresh), không còn trả `accessToken` trong JSON body.
  - `POST /auth/refresh` đọc refresh cookie, verify JWT + tra `AuthSession` còn sống + so hash, rotate **atomic** (cấp token mới, update hash trong DB bằng compare-and-swap), set lại 2 cookie.
  - `POST /auth/logout` revoke session theo `sid` trong refresh token, xóa cả 2 cookie.
  - `GET /auth/me` giữ nguyên hành vi — chỉ đổi cách lấy token đầu vào (cookie thay vì header).
  - Refresh token bị tái sử dụng sau khi đã rotate (đã revoke) → 401, **và revoke toàn bộ session-family của user đó** (không chỉ session bị nghi ngờ).
  - **[Red Team]** `/auth/login` và `/auth/refresh` có rate-limit riêng, chặt hơn throttle global (chống brute-force + chống DoS qua argon2 tốn tài nguyên).
  - **[Red Team]** Có CSRF defense trên mọi route state-changing (`login`, `refresh`, `logout`, và mọi route tương lai) — không chỉ dựa vào `SameSite`.
- Non-functional: secret access/refresh phải tách biệt (`JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`), access token TTL ngắn (15m default), refresh token TTL dài (7d default), password/token không bao giờ log ra (giữ nguyên `redact` hiện có trong `LoggerModule`, **mở rộng redact cho `req.headers.cookie` và `res.headers['set-cookie']`** — xem Finding CSRF/log).

## Architecture

```
Login → sign accessToken(15m, ACCESS_SECRET) + refreshToken(sid, 7d, REFRESH_SECRET)
      → argon2.hash(refreshToken) lưu vào AuthSession row mới
      → set-cookie access (path=/) + refresh (path=/auth — KHÔNG PHẢI /api/auth, xem lưu ý bên dưới)
      → set-cookie CSRF token (non-httpOnly, đọc được bằng JS) nếu dùng double-submit pattern

Request bình thường → JwtStrategy đọc access cookie → verify ACCESS_SECRET → load user → request.user

Refresh → đọc refresh cookie → verify REFRESH_SECRET (chữ ký) → tra AuthSession theo sid
        → so refreshTokenHash (argon2.verify) → nếu khớp: rotate ATOMIC bằng compare-and-swap
          (UPDATE ... WHERE id = sid AND refreshTokenHash = oldHash AND revokedAt IS NULL)
        → nếu update trả 0 row (đã bị rotate bởi request khác HOẶC bị đánh cắp): coi là race
          benign trước, chỉ revoke-toàn-bộ-family nếu hash cũ KHÔNG khớp bất kỳ giá trị hợp lệ nào
          (xem Implementation Steps bước 5 để biết cách phân biệt race vs replay thật)

Logout → verify refresh cookie → revoke AuthSession theo sid → clear cả 2 cookie
```

### [Red Team] Lưu ý bắt buộc: refresh cookie path

**Route thật của app KHÔNG có global prefix.** Grep xác nhận `apps/api/src/main.ts` không có `setGlobalPrefix` — route là `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`. `/api` là path mount của Swagger UI (`main.ts:45`), không liên quan route thật.

**Refresh cookie PHẢI set `path=/auth`** (không phải `/api/auth` như nháp ban đầu của plan — giá trị đó sai, đã verify bằng grep, xem Red Team Review trong `plan.md`). Nếu set sai path, browser sẽ không bao giờ gửi kèm refresh cookie tới `/auth/refresh` — lỗi này **không lộ ra khi test bằng curl/Postman** (vì test đó tự thêm `Cookie:` header thủ công, bỏ qua path scoping của browser thật), chỉ lộ ra khi test qua browser thật sau khi access token hết hạn (15 phút) — xem Success Criteria bắt buộc test qua browser thật, không chỉ qua curl.

### [Red Team] CSRF defense — bắt buộc, không phải tùy chọn

Chuyển từ `Authorization: Bearer` (miễn nhiễm CSRF vì browser không tự đính kèm header) sang cookie (browser tự đính kèm mọi request cùng origin, kể cả request khởi tạo từ site khác) **xóa bỏ một thuộc tính bảo mật đã có sẵn** — README hiện tại tự ghi nhận điều này ở dòng 58 ("miễn nhiễm CSRF mặc định"). Đây là đánh đổi có chủ đích (đã chốt ở brainstorm) nhưng phải có compensating control, không được bỏ trống:

- **Access cookie**: `SameSite=Lax` — đủ chặn CSRF cho request GET/top-level navigation, chặn được phần lớn form-POST tấn công đơn giản.
- **Refresh cookie**: `SameSite=Strict` (khuyến nghị mặc định cho base template — refresh chỉ gọi từ chính FE, không cần cross-site) hoặc `SameSite=Lax` nếu có nhu cầu cross-site cụ thể.
- **Nếu dự án con thật sự cần `SameSite=None`** (FE/BE khác domain hoàn toàn, không phải subdomain): **bắt buộc** thêm double-submit CSRF token (cookie không-httpOnly chứa token ngẫu nhiên, FE đọc và gửi lại qua header `X-CSRF-Token`, backend so khớp) hoặc Origin/Referer allowlist check trên mọi route state-changing. Đây không phải việc "để dự án con tự thêm sau" — phải có sẵn 1 guard tối thiểu (Origin check) trong base, vì `SameSite=None` là điều Phase 2 Risk Assessment (bản gốc) đã tự nói sẽ cần cho production khác domain.
- Base template mặc định **CHỈ hỗ trợ same-site deploy** (`SameSite=Strict`/`Lax` đủ dùng) trừ khi dự án con tự thêm CSRF token khi cần `SameSite=None` — ghi rõ giới hạn này trong Phase 6 (docs), không được xóa cảnh báo CSRF khỏi README mà không thay bằng cảnh báo tương đương.

Endpoint `/auth/refresh` và `/auth/logout` phải đánh dấu `@Public()` (không qua `JwtAuthGuard` bình thường vì access token có thể đã hết hạn lúc gọi refresh) nhưng tự đọc/verify refresh token riêng trong handler — theo đúng pattern `maycha_QAQC_app` (`auth.controller.ts` dòng 83-109 của repo đó).

## Related Code Files
- Create: `apps/api/src/modules/auth-sessions/auth-sessions.module.ts`
- Create: `apps/api/src/modules/auth-sessions/auth-sessions.service.ts`
- Create: `apps/api/src/modules/access-control/constants/auth-cookie.constants.ts` — **[Red Team]** single source of truth cho tên cookie (KHÔNG để "hoặc" giữa nhiều lựa chọn — quyết định ngay: 2 constant string export, `ACCESS_COOKIE_NAME` và `REFRESH_COOKIE_NAME`, dùng chung bởi `JwtStrategy`, `AuthController`, và mọi test)
- Create: **[Red Team]** CSRF guard/middleware — vị trí cụ thể tùy cách chọn (Origin-check guard đơn giản nhất, ví dụ `apps/api/src/common/guards/origin-check.guard.ts`) — xem Implementation Steps bước 10
- Modify: `apps/api/src/config/env.schema.ts` — thêm `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `AUTH_COOKIE_SECURE`
- Modify: `apps/api/src/modules/access-control/access-control.module.ts` — **[Red Team, sửa theo Finding]** KHÔNG xóa `JwtModule.registerAsync` — giữ đăng ký với `JWT_ACCESS_SECRET` làm default (để `JwtStrategy` và các nơi ký access token dùng default provider bình thường), chỉ truyền `secret` override per-call cho các chỗ ký/verify **refresh** token (`JWT_REFRESH_SECRET`). Lý do: `access-control.integration.spec.ts:58,82,91,104,113` lấy `JwtService` qua DI và ký token dựa vào secret global — xóa hẳn default sẽ làm toàn bộ 8 test case hiện có fail vì lý do không liên quan (thiếu secret), không phải vì cookie.
- Modify: `apps/api/src/modules/access-control/strategies/jwt.strategy.ts` — đổi `jwtFromRequest` sang đọc cookie qua constant từ `auth-cookie.constants.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` — thêm `refresh()`, `logout()`, sửa `login()` trả `TokenBundle` thay vì chỉ `accessToken`
- Modify: `apps/api/src/modules/auth/auth.controller.ts` — set/clear cookie, thêm route `refresh`/`logout`, thêm `@Throttle()` riêng cho `login`/`refresh`
- Modify: `apps/api/src/modules/auth/auth.module.ts` — import `AuthSessionsModule`
- Modify: `apps/api/src/modules/auth/dto/auth-result.dto.ts` — bỏ `accessToken` khỏi response body, **quyết định shape ngay tại đây (không hoãn sang phase 5)**: `AuthResultDto` chỉ còn `{ user: UserResponseDto }` — cân nhắc: nếu shape chỉ còn đúng 1 field trùng với `UserEnvelopeDto` đã có sẵn (`apps/api/src/modules/users/dto/user-envelope.dto.ts`), đánh giá tái dùng `UserEnvelopeDto` cho response `/auth/login` thay vì giữ `AuthResultDto`/`AuthLoginResponseDto` gần như trùng lặp — quyết định cụ thể khi implement, miễn là dừng ở 1 lựa chọn rõ ràng, không để "tùy" cho phase sau.
- Modify: `apps/api/src/main.ts` — đăng ký `cookie-parser` middleware, kiểm tra lại `enableCors({ credentials: true })` đã có sẵn — verify `origin` không phải `'*'`
- Modify: `apps/api/src/app.module.ts` — **[Red Team]** thêm `redact` entries cho `req.headers.cookie`/`res.headers['set-cookie']` trong `LoggerModule.forRootAsync` config (dòng 40 hiện tại chỉ redact `req.headers.authorization` — không còn đủ vì token giờ nằm trong cookie header)
- Modify: `apps/api/package.json` — thêm dependency `cookie-parser`, `@types/cookie-parser`
- Modify: `apps/api/prisma/schema.prisma` — **[Red Team, phối hợp với Phase 1]** nếu chưa thêm ở Phase 1, bổ sung field hỗ trợ compare-and-swap cho rotate (xem Implementation Steps bước 5) — cụ thể hóa tại đây vì đây là phase dùng field đó, Phase 1 chỉ cần đảm bảo field tồn tại.

## Implementation Steps
1. **Env schema**: thêm 5 field mới vào `env.schema.ts` (Zod), theo đúng pattern hiện có của `JWT_SECRET`/`JWT_EXPIRES_IN` (default dev-safe, throw ở production nếu vẫn là placeholder). `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` đều cần guard "refuse boot in production with default secret" như `JWT_SECRET` hiện có — áp dụng cho cả 2, **2 secret phải khác giá trị nhau** (thêm check: nếu `JWT_ACCESS_SECRET === JWT_REFRESH_SECRET` ở production → throw, vì dùng chung secret triệt tiêu lý do tách 2 secret).
2. **`auth-cookie.constants.ts`**: tạo file mới, export `ACCESS_COOKIE_NAME = 'app_access_token'`, `REFRESH_COOKIE_NAME = 'app_refresh_token'` (tên rõ ràng, không trùng với `app_auth_token` cũ ở FE `localStorage` — tên đó sẽ bị xóa hẳn ở phase 4, nhưng đặt tên khác hẳn để tránh nhầm lẫn khi đọc log/DevTools trong lúc migrate).
3. **`AuthSessionsModule`/`AuthSessionsService`**: tạo module mới, service inject `PrismaService`, các hàm:
   - `createSession({ userId, refreshTokenHash, expiresAt, ipAddress, userAgent })` — tạo row, trả về `id` làm `sid`.
   - `getActiveSessionOrThrow(sessionId)` — tìm theo `id`, throw `UnauthorizedException` nếu không có/đã `revokedAt`/đã hết hạn.
   - `rotateSessionAtomic(sessionId, oldHash, newHash, newExpiresAt)` — **[Red Team, đổi tên + đổi hành vi]** dùng `prisma.authSession.updateMany({ where: { id: sessionId, refreshTokenHash: oldHash, revokedAt: null }, data: { refreshTokenHash: newHash, expiresAt: newExpiresAt, lastUsedAt: new Date() } })`, trả về `result.count` — caller (bước 5) dùng `count` để phân biệt race vs replay thật.
   - `revokeSession(sessionId)` — set `revokedAt = now()`.
   - `revokeAllUserSessions(userId)` — update nhiều row theo `userId`, dùng index đã tạo ở phase 1. **[Red Team] Phải có ít nhất 1 call site thật trong phase này** (bước 6, revoke-on-replay) — không để lại như dead code không ai gọi.
   - Không thêm `touchSession`/`ipAddress`/`userAgent` tracking chi tiết trong phase này — cắt theo review Scope Critic (YAGNI, không ai đọc field này), giữ `ipAddress`/`userAgent` optional nullable trong schema (đã có ở Phase 1) cho tương lai nhưng không viết logic ghi liên tục.
4. **`JwtStrategy`**: viết custom extractor đọc `request.cookies[ACCESS_COOKIE_NAME]` (import từ `auth-cookie.constants.ts`, không hardcode string). Đổi `secretOrKey` sang đọc `JWT_ACCESS_SECRET`.
5. **`AuthService.login()`**: sau khi verify password (argon2 — xem phase 3), gọi `issueTokenBundle()` (hàm private mới, ký 2 token với 2 secret khác nhau, truyền `secret` override cho refresh vì `JwtModule` default giờ là access secret — xem Related Code Files) + `authSessionsService.createSession(...)` lưu `argon2.hash(refreshToken)`. Trả về `{ user, tokens }` ở tầng service — **controller** (bước 8) là nơi tách `tokens` ra để set cookie, **route handler tuyệt đối không được return `tokens` trong object mà `TransformInterceptor` sẽ serialize** (nếu return `{ user, tokens }` trực tiếp từ controller method, `tokens` sẽ lộ ra JSON body — đây là lỗi cụ thể cần tránh, viết controller trả về `{ user }` only).
6. **`AuthService.refresh()`** — **[Red Team, viết lại toàn bộ logic rotate]**:
   - Verify chữ ký refresh token bằng `JWT_REFRESH_SECRET` → lấy `sid`.
   - `authSessionsService.getActiveSessionOrThrow(sid)` → lấy `session.refreshTokenHash` hiện tại.
   - `argon2.verify(session.refreshTokenHash, rawToken)`:
     - Nếu **đúng**: sinh token bundle mới, `argon2.hash(newRefreshToken)`, gọi `rotateSessionAtomic(sid, session.refreshTokenHash, newHash, newExpiresAt)`.
       - Nếu `count === 1`: rotate thành công, trả token mới.
       - Nếu `count === 0`: có request khác đã rotate trước (race) — **không revoke**, thử lại 1 lần: đọc lại session mới nhất, nếu `argon2.verify` khớp hash MỚI với token cũ thì coi là đã rotate rồi, trả lỗi 409/particular "session vừa được làm mới, thử lại request gốc" thay vì 401 cứng (tránh đá user ra vì race benign). Nếu không khớp cả hash mới → đây là dấu hiệu bất thường thật, revoke.
     - Nếu **sai** (hash không khớp verify ban đầu): đây là dấu hiệu replay thật (token cũ đã bị rotate từ trước, ai đó dùng lại bản cũ) → `revokeAllUserSessions(session.userId)` (**không chỉ 1 session** — toàn bộ family, vì token family coi như đã bị lộ) + throw 401.
   - Ghi chú: đây là điểm phức tạp nhất của cả plan — bắt buộc có test case riêng cho từng nhánh (xem Phase 5).
7. **`AuthService.logout()`**: verify refresh token (best-effort, không throw nếu invalid/thiếu — logout luôn "thành công" từ góc nhìn client) → `revokeSession(sid)`. **[Red Team]** Success criterion phải verify `revokedAt` thật trong DB sau logout, không chỉ verify cookie bị xóa ở response (xem Success Criteria).
8. **`AuthController`**: thêm helper `applyAuthCookies(response, tokens)` và `clearAuthCookies(response)` (port gần 1:1 từ `maycha_QAQC_app` dòng 174-212, **path refresh cookie sửa thành `/auth`**), dùng `@Res({ passthrough: true })`, controller method return `{ user }` (không bao giờ return `tokens`). Thêm `@Throttle({ default: { limit: 5, ttl: 60000 } })` (5 request/phút, tách khỏi throttle global 100/phút) trên `login` và `refresh` — chống brute-force + chống DoS qua argon2 (mỗi lần verify tốn ~50-100ms CPU + bộ nhớ, endpoint `@Public()` nên ai cũng gọi được).
9. **CSRF defense**: thêm 1 guard đơn giản kiểm tra header `Origin` (hoặc `Sec-Fetch-Site`) khớp `WEB_ORIGIN` cho mọi route không phải `GET`, áp dụng qua `APP_GUARD` hoặc decorator riêng trên các route state-changing hiện có (`login`, `refresh`, `logout`). Đây là compensating control tối thiểu — không cần double-submit token đầy đủ nếu base template mặc định same-site (`SameSite=Strict`/`Lax`), nhưng vẫn nên có Origin check làm lớp phòng thủ thứ 2 (defense in depth), rẻ để implement.
10. **`main.ts`**: `app.use(cookieParser())` trước `app.useGlobalPipes(...)`. Verify `WEB_ORIGIN` trong CORS config là domain cụ thể (đã đúng sẵn, không phải `*`).
11. **`app.module.ts`**: mở rộng `redact` trong `LoggerModule.forRootAsync` — thêm `'req.headers.cookie'`, `'res.headers["set-cookie"]'` vào mảng redact hiện có (dòng 40), vì giờ token nằm trong cookie header thay vì chỉ `Authorization`.
12. **Xóa** field `accessToken` khỏi `AuthResultDto`/response mà FE nhận — cập nhật Swagger `@ApiProperty` tương ứng, chạy `pnpm codegen` **sau khi** `docker compose up -d` và `.env` đã có đủ 5 biến JWT mới (codegen boot `AppModule` thật, cần DB sống + env hợp lệ — xem Risk Assessment) để Orval sinh lại type (block cho phase 4).

## Success Criteria
- [x] `POST /auth/login` trả `Set-Cookie` cho cả access và refresh, body JSON không còn `accessToken` VÀ không có field `tokens` nào lộ ra — verify qua curl thật, response body chỉ có `{ user }`
- [x] **[Red Team]** Test qua browser thật (agent-browser, không chỉ curl): login → giả lập access token hết hạn (`JWT_ACCESS_TTL=5s`) → gọi request cần auth → tự động 401 → `/auth/refresh` → browser tự gửi refresh cookie đúng path `/auth` → 200
- [x] `POST /auth/refresh` với refresh cookie hợp lệ → 200, `Set-Cookie` mới, `AuthSession` row rotate (hash đổi, `expiresAt` cập nhật) — verify bằng CAS thành công (`count === 1`) qua integration test thật với Postgres
- [x] `POST /auth/refresh` gọi lại với refresh token **cũ** (đã rotate) → 401, **toàn bộ session của user đó** bị revoke — verify qua curl thật (query DB xác nhận 3 session đều `revokedAt` khác null) và integration test (`revokeAllUserSessions` scoped đúng user, không đụng user khác)
- [x] **[Red Team]** Test race condition: CAS `count: 0` → không revoke oan, trả `ConflictException` (409) thay vì 401 cứng (sửa theo code review sau khi phát hiện gap giữa plan và implementation ban đầu) — unit test 2 case (benign race vs bất thường thật) + FE retry-once-on-409
- [x] `POST /auth/logout` → cookie bị clear VÀ `AuthSession.revokedAt` trong DB thật khác `null` sau đó — verify qua psql query trực tiếp
- [x] `GET /auth/me` hoạt động đúng khi access cookie hợp lệ, 401 khi thiếu/hết hạn — verify qua curl + integration test
- [x] **[Red Team]** Request cross-origin giả lập (`Origin: http://evil.com`) tới `POST /auth/logout` → 403 bởi `OriginCheckGuard`, verify qua curl thật + unit test `origin-check.guard.spec.ts` (6 case, thêm sau code review)
- [x] **[Red Team]** `login`/`refresh` gọi quá 5 lần/phút từ cùng IP → 429 — verify qua curl loop thật (4 request đầu 401, từ request thứ 4-6 trả 429)
- [x] `pnpm --filter=api build` không lỗi biên dịch
- [x] `pnpm codegen` chạy thành công, `apps/web/lib/api/generated/model/authResultDto.ts` xác nhận không còn `accessToken`
- [x] **[Red Team]** 8 test case cũ + 1 test case mới (access-token-hết-hạn) trong `access-control.integration.spec.ts` pass (9/9) — `JwtModule` default provider (access secret) giữ nguyên đúng như thiết kế đã sửa

## Risk Assessment
- **Guard order**: `JwtAuthGuard`/`PermissionsGuard` không đổi logic, chỉ đổi nguồn đọc token trong `JwtStrategy` — rủi ro thấp vì Passport strategy interface không đổi.
- **`/auth/refresh` và `/auth/logout` là `@Public()`**: cần đảm bảo 2 route này tự verify refresh token thủ công trong service, KHÔNG bỏ qua xác thực hoàn toàn — nếu thiếu bước verify, đây là lỗ hổng cho phép refresh token giả mạo. Test case bắt buộc: refresh token bị sửa 1 ký tự → 401.
- **[Red Team] CSRF là rủi ro Critical nếu bỏ qua**: đây không phải "nice to have" — chuyển sang cookie mà không có Origin check/CSRF token là quay lại đúng lỗ hổng mà thiết kế cũ (Bearer header) đã miễn nhiễm. Không được coi đây là việc "dự án con tự lo" — base template phải có compensating control tối thiểu (Origin check) sẵn.
- **[Red Team] Race condition trong rotate là rủi ro Critical nếu không atomic**: bất kỳ trang nào bắn nhiều request song song (rất phổ biến với TanStack Query multi-query) sẽ trigger rotate đồng thời — nếu không dùng compare-and-swap, user bị đăng xuất ngẫu nhiên giữa phiên làm việc bình thường, không phải do bug hiếm gặp mà là hành vi mặc định.
- **CORS + cookie cross-origin**: nếu `apps/web` (port 3000) và `apps/api` (port 3001) khác origin (dev), cookie cần `SameSite=Lax` là đủ (same-site vì cùng `localhost`, khác port không phá same-site) — nhưng phải verify `credentials: 'include'` đã có ở Phase 4 trước khi test Phase 2 qua browser, nếu không `Set-Cookie` bị set nhưng bị browser âm thầm bỏ qua lúc gửi request tiếp theo, dễ nhầm là lỗi Phase 4 (xem lưu ý cross-phase testing).
- **[Red Team] `pnpm codegen` cần DB sống + env đầy đủ**: lệnh này boot `AppModule` thật (bao gồm `PrismaService.onModuleInit` → `$connect()` và `validateEnv`) — không phải lệnh thuần túy generate file tĩnh. Chạy trước khi `docker compose up -d` hoặc thiếu biến JWT mới trong `.env` sẽ fail với lỗi trông giống lỗi Swagger/OpenAPI nhưng thực ra là lỗi kết nối DB/env — dễ gây nhầm lẫn khi debug.
- **Breaking change với FE**: phase 2 xong nhưng FE (phase 4) chưa cập nhật → FE cũ (đọc `accessToken` từ JSON, không gửi `credentials: 'include'`) sẽ vỡ hoàn toàn kể cả login cơ bản. Đây là lý do Phase 2 không nên coi là "xong" tới khi Phase 4 cũng xong — 2 phase này về bản chất phải test cùng nhau qua browser thật trước khi merge, dù file thay đổi độc lập.
