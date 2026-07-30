# Brainstorm Report: Implement auth thật (guard/strategy/permission) + chuẩn bị cho AppShell

## Bối cảnh

Follow-up từ `/ck:devops` round trước (infra hardening, commit `cc0250c`). Câu hỏi lần này: so với `maycha_QAQC_app` (project tương tự, production-harder hơn), template còn thiếu gì ở khâu frontend/backend khi clone ra dùng thật.

## Cross-reference: maycha_QAQC_app (Explore agent, không đọc node_modules)

Tìm được 5 điểm đáng giá:
1. **`foundation/` module** (backend) — gom `AppConfigService`, pino, swagger bootstrap, validation pipe vào 1 module `@Global()` thay vì rải rác `main.ts`/`app.module.ts`.
2. **Seed script convention** — `src/scripts/seed-*.ts` dùng `NestFactory.createApplicationContext`.
3. **Health module Terminus indicator pattern** đầy đủ hơn (readiness/liveness tách biệt) — bỏ phần MinIO-specific.
4. **Exception filter có `code` taxonomy** (`BAD_REQUEST`, `UNAUTHORIZED`...) thay vì chỉ `{statusCode, message, error}`.
5. **AppShell pattern** (sidebar + topbar + breadcrumb + mobile drawer + nav config lọc theo permission) — gap lớn nhất, vì base hiện chỉ có `app/(auth)/login`, KHÔNG có route group nào cho "sau khi đăng nhập". QAQC code dùng Ant Design (base dùng shadcn/Tailwind) — không copy được, chỉ tham khảo cấu trúc.

Xác nhận KHÔNG phải gap (cả 2 project đều không có, không tự thêm): AsyncLocalStorage/request-id propagation, base repository/service abstract, pagination helper, BullMQ, audit-log module, soft-delete, multi-tenancy, websocket/SSE, MSW, i18n, `middleware.ts` route protection (QAQC cũng chỉ client-side), DataTable+`-columns.ts` live example (QAQC dùng Ant Design nên không giúp).

## Quyết định phạm vi (qua AskUserQuestion)

- Ưu tiên: **AppShell trước** — nhưng AppShell cần biết user/permission thật để lọc nav menu.
- Vì base cố ý để auth stub (README ghi rõ, 4 chỗ TODO), AppShell không thể demo permission-filtered nav nếu auth vẫn giả — quyết định: **làm auth thật trước, AppShell dựa trên auth đã xong sau**.
- **Tách 2 plan độc lập** (không gộp) — auth là security-critical, AppShell là UI, rủi ro khác loại, không trộn vào 1 PR.
- Plan này (plan hiện tại) chỉ scope **auth thật**. AppShell là plan kế tiếp, sau khi plan này merge + test pass.

## Scout: code auth hiện tại (tất cả đã đọc trực tiếp)

- `JwtAuthGuard.canActivate` → `return true` cứng, TODO ghi rõ cần check `PUBLIC_KEY` metadata qua `Reflector` rồi delegate `super.canActivate()`.
- `PermissionsGuard.canActivate` → `return true` cứng, TODO ghi rõ cần đọc `REQUIRE_PERMISSIONS_KEY`, lấy `request.user.role`, gọi `hasPermission()`, throw `ForbiddenException`.
- `JwtStrategy.validate()` → hardcode `role: 'ADMIN'` cho MỌI JWT hợp lệ (README gọi đây là bẫy nguy hiểm nhất — sâu hơn cả guard không làm gì). TODO: `UsersService.findById(payload.sub)` thật, throw `UnauthorizedException` nếu absent.
- `hasPermission()` (`role-permissions.ts`) → `return true` cứng. `ROLE_PERMISSIONS` đã định nghĩa sẵn: `ADMIN: ['*']`, `TRAINER: []`, `TRAINEE: []`. TODO: evaluate `required` against map, xử lý wildcard `'*'`.
- `UsersService.findById`/`findByEmail` → trả `null`. `create()` → throw `not implemented`, KHÔNG có endpoint nào gọi (chỉ là signature slot cho ai thêm registration sau).
- `AuthService.login()` → trả `{accessToken: 'stub-token', user: STUB_USER}` cứng, bỏ qua `_dto`. TODO: `findByEmail` + `bcrypt.compare` + `jwtService.signAsync`.
- `AuthService.me()` → trả `STUB_USER` cứng. TODO: `usersService.findById(userId)` thật.
- Prisma `User` model đã có `password: String` field, nhưng **không có bcrypt/argon2 trong deps** — cần thêm.
- Frontend `use-auth-actions.ts` → `login()` gọi API thật nhưng bỏ qua kết quả (catch rỗng, TODO ghi rõ cần: `setToken()`, `queryClient.invalidateQueries()`, `toast.success`, `router.push('/')`, `toast.error` khi fail). `lib/auth/auth-token.ts` đã có sẵn `getToken`/`setToken`/`clearToken` (localStorage), chưa dùng ở đâu.
- `app/page.tsx` chỉ là placeholder text `<main>Training App</main>` — không có route "sau login" nào tồn tại.

## Quyết định: cách tạo user đầu tiên

Không thêm endpoint `POST /auth/register` public (mở rộng scope không cần thiết, base không cần self-registration). Chọn: **seed script** `apps/api/src/scripts/seed-admin.ts` theo pattern QAQC (`NestFactory.createApplicationContext`), tạo 1 admin user password đã hash sẵn, chạy qua `pnpm --filter=api seed`.

## Quyết định: test coverage

**Bắt buộc** viết integration test cho boundary thật (không chỉ "endpoint trả 200") — đúng tinh thần cảnh báo của README: request không token → 401, sai permission → 403, verify JwtStrategy KHÔNG còn hardcode ADMIN cho mọi token.

## Phạm vi plan (auth thật)

1. `JwtAuthGuard.canActivate` — check `@Public()` metadata, delegate `super.canActivate()`.
2. `JwtStrategy.validate()` — `UsersService.findById` thật, throw `UnauthorizedException` nếu absent.
3. `hasPermission()` — implement thật theo `ROLE_PERMISSIONS`, xử lý wildcard.
4. `PermissionsGuard.canActivate` — đọc metadata, gọi `hasPermission()`, throw `ForbiddenException`.
5. `UsersService.findById`/`findByEmail` — Prisma thật. `create()` giữ nguyên slot, không implement (không có caller).
6. `AuthService.login()` — `findByEmail` + `bcrypt.compare` + `jwtService.signAsync({sub: user.id})`, throw `UnauthorizedException` khi sai.
7. `AuthService.me()` — `usersService.findById` thật.
8. Seed script `seed-admin.ts` + script `pnpm --filter=api seed`.
9. Thêm dep `bcrypt` + `@types/bcrypt`.
10. Frontend `use-auth-actions.ts` — hoàn thiện theo TODO đã ghi sẵn (setToken, invalidate, toast, redirect).
11. Test boundary bắt buộc: 401 không token, 403 sai permission, xác nhận hết hardcode ADMIN.

## Next steps

Chuyển `/ck:plan --hard` (2 researcher: JWT/bcrypt best practice + NestJS testing pattern cho guard, kèm red-team review sau khi plan xong) — vì đây là security-critical code, khác với round infra thuần trước.

AppShell (gap #5) là plan riêng, làm SAU khi plan này merge + test pass.

## Unresolved questions

Không có — mọi quyết định phạm vi đã chốt qua AskUserQuestion.
