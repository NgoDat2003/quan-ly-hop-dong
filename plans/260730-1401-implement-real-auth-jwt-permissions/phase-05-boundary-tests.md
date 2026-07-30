---
phase: 5
title: Boundary tests
status: completed
priority: P1
effort: 2h
dependencies:
  - 1
  - 2
  - 3
  - 4
---

# Phase 5: Boundary tests

## Overview

Viết integration test chứng minh guard/strategy thực sự chặn request sai — không chỉ "endpoint trả 200". Đây là phần README cảnh báo là thiếu sót nghiêm trọng nhất của base gốc: mọi stub đều chạy "thành công" không throw, không log cảnh báo.

## Key Insights (từ research testing pattern + red-team review)

- **Integration test qua `Test.createTestingModule` + supertest là primary**, KHÔNG mock `ExecutionContext`/guard trực tiếp — mock guard nghĩa là thay thế hẳn guard, không chứng minh được gì về hành vi thật.
- **Không mock Passport `AuthGuard('jwt')` internals** — sinh JWT thật qua `JwtService.sign()`, gửi qua header `Authorization`, để Passport tự validate. Chỉ mock tầng DB (`PrismaService`/`UsersService`).
- **Pitfall lớn nhất cần tránh (chính README đã cảnh báo)**: mock `UsersService.findById` trả hardcode `{role: 'ADMIN'}` cho MỌI id — làm vậy thì test tự nó lặp lại đúng cái bug cũ, không phát hiện được gì. Mock phải trả role KHÁC NHAU theo input, và có case trả `null` (user không tồn tại).
- **[Red-team fix]** `AccessControlModule` là `@Global()` (`access-control.module.ts:11`), và `PrismaModule` cũng `@Global()` với `PrismaService.onModuleInit()` gọi `$connect()` thật (`prisma.service.ts:19-21`). Nếu test import `AccessControlModule` thật (bắt buộc, để test qua `APP_GUARD` chain thật chứ không tự instantiate guard tay) mà KHÔNG override `PrismaService`, `Test.createTestingModule().compile()` sẽ cố kết nối Postgres thật — fail/hang nếu không có Docker chạy. PHẢI override CẢ `PrismaService` VÀ `UsersService` tường minh trong mọi test module, không chỉ `UsersService`.
- **[Red-team fix]** Test PHẢI import module thật (`AccessControlModule` + `ConfigModule`, không tự tạo `new JwtAuthGuard(...)` rồi gọi `.canActivate()` tay) — mục đích là verify guard được wire đúng qua cơ chế `APP_GUARD` thật, không chỉ verify logic guard cô lập. Nếu chỉ test logic cô lập, 1 bug kiểu "ai đó lỡ xoá dòng đăng ký `APP_GUARD` khỏi `AccessControlModule`" sẽ không bị test nào bắt được.
- **[Red-team fix, gộp scope]** Gộp `jwt-auth.guard.spec.ts` + `permissions.guard.spec.ts` thành **1 file** `access-control.integration.spec.ts` — 2 guard này luôn chạy cùng nhau trong cùng 1 request pipeline (`JwtAuthGuard` → `PermissionsGuard`, cùng module cùng array, xem Phase 2), tách riêng file chỉ nhân đôi phần setup `TestController`/JWT signing mà không tăng thêm coverage thật. 1 file dùng chung `TestController` với nhiều route (public, protected thường, protected + `@RequirePermissions`, protected + `@Public()` + `@RequirePermissions` cùng lúc).
- **[Red-team fix, bỏ trùng lặp]** KHÔNG viết `jwt.strategy.spec.ts` riêng — integration test qua `AuthGuard('jwt')` thật đã tự động chạy `JwtStrategy.validate()` bên trong (Passport tự gọi khi `super.canActivate()` chạy), nên case "user not found trong DB → 401" đã được cover bởi integration test, viết thêm unit test riêng chỉ lặp lại đúng 1 assertion qua 1 lớp mỏng hơn, tạo 2 nguồn chân lý cho cùng 1 business rule.
- **[Red-team fix, test case bị thiếu]** Thêm case `@Public()` + `@RequirePermissions()` cùng lúc trên 1 route — `JwtAuthGuard` bypass hoàn toàn (do `@Public()`), khiến `request.user` là `undefined` khi tới `PermissionsGuard`. Verify `PermissionsGuard` xử lý đúng (không throw `TypeError` khi đọc `undefined.role`, và **không** vô tình pass do thiếu check) — đây là test case bảo vệ chống lại 1 regression cụ thể: nếu sau này ai đó "tối ưu" `PermissionsGuard` bằng cách thêm `if (!user) return true;` (tưởng là defensive), route này sẽ âm thầm mất toàn bộ permission check mà không test nào khác bắt được.
- **[Red-team fix, guard order thật]** Thêm 1 test case xác nhận cross-module guard order thật (không chỉ dựa giả định): route có `@RequirePermissions(...)` + JWT hợp lệ + đủ quyền → request đi qua đúng, `request.user` đã được `JwtAuthGuard` gắn TRƯỚC khi `PermissionsGuard` đọc nó. Đây là bước verify thật mà `app.module.ts:64-72`'s code comment đã yêu cầu từ trước (xem Phase 2 bước 7).

## Requirements

Bắt buộc chứng minh (theo yêu cầu người dùng, không thương lượng):
1. Request không có `Authorization` header → 401.
2. JWT hợp lệ nhưng `payload.sub` không map user nào trong DB (mock `findById` trả `null`) → 401 — đây chính là test trực tiếp chống lại bug hardcode ADMIN cũ.
3. JWT hợp lệ, user tồn tại nhưng thiếu permission yêu cầu (`@RequirePermissions`) → 403.
4. Route có `@Public()` → bypass, không bị chặn dù không có token.
5. JWT hợp lệ, user có đủ permission → request đi qua tới controller (200, hoặc status tương ứng logic handler).
6. Route có cả `@Public()` VÀ `@RequirePermissions()` → bypass đúng (không 403 do `request.user` undefined).
7. Guard order thật: `request.user` đã sẵn sàng khi `PermissionsGuard` chạy (chứng minh gián tiếp qua case 5 pass đúng, không phải qua giả định).

## Architecture

```
apps/api/src/modules/access-control/
└── access-control.integration.spec.ts   # GỘP: cả JwtAuthGuard + PermissionsGuard, 1 TestController nhiều route
                                          # import AccessControlModule + ConfigModule thật
                                          # override PrismaService VÀ UsersService

apps/api/src/modules/auth/
└── auth.service.spec.ts                 # ĐÃ CÓ SẴN — cập nhật cho login()/me() thật, xoá test cho STUB_USER cũ nếu có
```

Test controller giả (`TestController` nội bộ trong spec file) dùng để gắn `@Public()`/`@RequirePermissions()` mẫu, verify guard chặn đúng — không cần route thật trong app.

## Related Code Files

- Create: `apps/api/src/modules/access-control/access-control.integration.spec.ts`
- Modify: `apps/api/src/modules/auth/auth.service.spec.ts` (file đã tồn tại — đọc trước khi sửa, cập nhật theo login/me thật)

## Implementation Steps

1. Đọc `apps/api/src/modules/auth/auth.service.spec.ts` hiện có (file đã tồn tại từ trước plan này) để hiểu convention test đang dùng trong repo (mock style, cách setup `Test.createTestingModule`).
2. Viết `access-control.integration.spec.ts`:
   - Định nghĩa `TestController` cục bộ với các route: 1 route protected mặc định (không decorator), 1 route `@Public()`, 1 route `@RequirePermissions('some:action')`, 1 route có cả `@Public()` + `@RequirePermissions('some:action')`.
   - `Test.createTestingModule({ imports: [ConfigModule.forRoot({validate: validateEnv}), AccessControlModule], controllers: [TestController] })` — import module THẬT, không tự tạo instance guard tay.
   - `.overrideProvider(PrismaService).useValue(mockPrismaService)` VÀ `.overrideProvider(UsersService).useValue(mockUsersService)` — cả 2, không chỉ 1.
   - Sinh JWT thật qua `app.get(JwtService).sign({sub: 'some-id'})`, gửi qua header `Authorization: Bearer <token>`.
   - Test case 1: "no Authorization header → 401".
   - Test case 2: "invalid/malformed JWT → 401".
   - Test case 3: "valid JWT, user not found in DB (mock `findById` trả `null`) → 401" — case quan trọng nhất, trực tiếp verify không còn hardcode.
   - Test case 4: "valid JWT, user found (role TRAINEE) → route không yêu cầu permission → 200, `request.user` đúng (không phải hardcode ADMIN)".
   - Test case 5: "`@Public()` route → bypass, không cần token, dù mock `findById` không được set up".
   - Test case 6: "user role TRAINEE (permission rỗng theo `ROLE_PERMISSIONS`) truy cập route `@RequirePermissions` → 403".
   - Test case 7: "user role ADMIN (wildcard `'*'`) truy cập route `@RequirePermissions` → 200 — xác nhận `request.user` đã sẵn sàng khi `PermissionsGuard` chạy, verify guard order thật".
   - Test case 8: "route có cả `@Public()` + `@RequirePermissions()` → bypass hoàn toàn (không 403, không throw), verify `PermissionsGuard` không crash khi `request.user` undefined".
3. Sửa `auth.service.spec.ts` — cập nhật test cho `login()` thật: mock `UsersService.findByEmail`/`bcryptjs.compare`, test case email không tồn tại → 401 cùng message với sai password (không phân biệt được qua response), test login đúng → trả `accessToken` + `user` không có password, test `me()` với `findById` trả `null` → `UnauthorizedException`.
4. Chạy `pnpm --filter=api test` — toàn bộ suite phải pass, không skip test nào, KHÔNG cần Docker/Postgres chạy (toàn bộ Prisma đã mock).
5. Review lại: đọc từng test đã viết, tự hỏi "test này có thực sự fail nếu tôi revert code về hardcode `role: 'ADMIN'` không?" — nếu không chắc, sửa lại test cho chặt hơn. Verify 1 lần bằng cách tạm revert `JwtStrategy.validate()` về hardcode, chạy `pnpm --filter=api test`, xác nhận test case 3 fail, rồi revert lại code đúng.

## Success Criteria

- [ ] Test tồn tại và pass cho cả 7 requirement liệt kê ở trên (đã mở rộng từ 5 lên 7 sau red-team).
- [ ] Test "user not found → 401" thực sự fail nếu tạm thời revert `JwtStrategy.validate()` về hardcode (verify thủ công 1 lần bằng cách revert tạm, chạy test thấy fail, rồi revert lại code đúng).
- [ ] `pnpm --filter=api test` toàn bộ suite pass, không có test bị skip/todo, không cần Docker chạy.
- [ ] Không có test nào mock trực tiếp `JwtAuthGuard`/`PermissionsGuard`/`AuthGuard('jwt')` — chỉ mock tầng DB (`PrismaService` + `UsersService`).
- [ ] Chỉ 1 file test cho access-control (`access-control.integration.spec.ts`), không tách `jwt-auth.guard.spec.ts`/`permissions.guard.spec.ts`/`jwt.strategy.spec.ts` riêng.

## Risk Assessment

Rủi ro chính: viết test "giả bộ" pass (mock quá sâu khiến test không còn kiểm tra logic thật) — đây chính là pitfall #1 mà research nêu rõ. Mitigation: bước cuối (step 5) bắt buộc tự verify bằng cách revert code tạm thời và xem test có bắt được không. Rủi ro thứ 2 (đã bị red-team bắt được): quên mock `PrismaService` khiến test cố kết nối DB thật — mitigation là mock cả 2 provider tường minh ngay từ bước 2, không chỉ `UsersService`.

## Security Considerations

Test không được dùng JWT_SECRET/password thật của bất kỳ môi trường nào — dùng giá trị test cố định trong `env.schema.ts` default hoặc set trực tiếp trong spec file setup. Vì Phase 3 đã thêm production guard cho `JWT_SECRET`, đảm bảo test không set `NODE_ENV=production` khi chạy (nếu không app boot sẽ throw do `JWT_SECRET` vẫn là default) — test nên chạy với `NODE_ENV=test` hoặc để mặc định `development`.
