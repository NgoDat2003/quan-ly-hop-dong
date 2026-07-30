---
phase: 2
title: JWT strategy and guards
status: completed
priority: P1
effort: 1h
dependencies:
  - 1
---

# Phase 2: JWT strategy and guards

## Overview

Implement `JwtAuthGuard.canActivate` (check `@Public()`, delegate Passport thật), `JwtStrategy.validate()` (tra `UsersService.findById` thật thay vì hardcode `role: 'ADMIN'`), `hasPermission()` (evaluate `ROLE_PERMISSIONS` thật), `PermissionsGuard.canActivate` (đọc `@RequirePermissions()`, gọi `hasPermission()`, throw `ForbiddenException`).

## Key Insights

- Đây là phần README gọi là "bẫy nguy hiểm nhất" — `JwtStrategy.validate()` hiện hardcode `role: 'ADMIN'` cho MỌI JWT hợp lệ, khiến 1 route có `@RequirePermissions()` đúng chuẩn vẫn âm thầm cấp quyền admin cho bất kỳ user đã đăng nhập.
- `ROLE_PERMISSIONS` đã định nghĩa sẵn: `ADMIN: ['*']`, `TRAINER: []`, `TRAINEE: []` — chỉ cần viết logic evaluate, không cần định nghĩa lại map.
- Guard order gồm 2 loại guarantee KHÁC NHAU, không được gộp chung như 1 giả định duy nhất (red-team review đã phát hiện plan gốc nhầm lẫn điểm này):
  - `JwtAuthGuard` → `PermissionsGuard`: đăng ký CÙNG module (`AccessControlModule`), CÙNG array `providers` (`access-control.module.ts:29-30`, có comment `// runs first`/`// runs second`) — đây là thứ tự **deterministic**, NestJS DI đảm bảo thứ tự trong cùng 1 array. An toàn để `PermissionsGuard` đọc `request.user` do `JwtAuthGuard` gắn vào.
  - `ThrottlerGuard` (đăng ký ở `AppModule`) → `AccessControlModule`'s guards: đây mới là phần **KHÔNG có guarantee** — cross-module `APP_GUARD` order không được NestJS document. Code comment tại `app.module.ts:64-72` đã tự flag: *"re-verify this empirically once JwtAuthGuard/PermissionsGuard hold real logic"* — **Phase 2 chính là thời điểm đó**. Không được bỏ qua bước verify này nữa (xem Implementation Steps bước 7 mới).
- `PermissionsGuard` cần đọc `request.user` — user này được `JwtAuthGuard`/Passport gắn vào request qua `JwtStrategy.validate()` return value. Nếu `JwtAuthGuard` chưa chạy thật (Phase 2 làm đồng thời cả 2 guard), `request.user` sẽ undefined — 2 guard PHẢI hoàn thiện cùng lúc trong phase này, không tách riêng.
- `@Public()` metadata dùng `PUBLIC_KEY` đã có sẵn qua `Reflector` — `JwtAuthGuard` cần check cả `context.getHandler()` và `context.getClass()` (route-level và controller-level `@Public()`).

## Requirements

- Functional: Route có `@Public()` bypass hoàn toàn JWT check.
- Functional: Route không có `@Public()`, request không có/token không hợp lệ → 401 (Passport's `AuthGuard('jwt')` xử lý qua exception filter mặc định).
- Functional: `JwtStrategy.validate()` — token hợp lệ nhưng `payload.sub` không map tới user nào trong DB → `UnauthorizedException`.
- Functional: `hasPermission(role, required)` — `ADMIN` luôn pass (wildcard `'*'`), role khác chỉ pass nếu `ROLE_PERMISSIONS[role]` chứa đủ permission yêu cầu.
- Functional: `PermissionsGuard` — route có `@RequirePermissions(...)`, user thiếu permission → `ForbiddenException` (403). Route không có `@RequirePermissions()` → pass (không yêu cầu gì).

## Architecture

```
Request → ThrottlerGuard → JwtAuthGuard → PermissionsGuard → Controller
                                │                │
                                ▼                ▼
                         JwtStrategy.validate  hasPermission(request.user.role, requiredPerms)
                         (Passport, tự động     (đọc @RequirePermissions metadata qua Reflector)
                          chạy khi AuthGuard
                          delegate xuống)
```

## Related Code Files

- Modify: `apps/api/src/modules/access-control/guards/jwt-auth.guard.ts`
- Modify: `apps/api/src/modules/access-control/guards/permissions.guard.ts`
- Modify: `apps/api/src/modules/access-control/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/modules/access-control/role-permissions.ts`

## Implementation Steps

1. Sửa `jwt-auth.guard.ts`:
   ```typescript
   canActivate(context: ExecutionContext) {
     const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
       context.getHandler(),
       context.getClass(),
     ]);
     if (isPublic) return true;
     return super.canActivate(context);
   }
   ```
2. Sửa `jwt.strategy.ts`: inject `UsersService`, `validate(payload)` gọi `usersService.findById(payload.sub)`, throw `UnauthorizedException('User not found')` nếu `null`/`undefined`. Cần thêm `UsersModule` vào import của `AccessControlModule` nếu chưa có (kiểm tra lúc code — tránh circular dependency nếu `UsersModule` đã import ngược `AccessControlModule`).
3. Sửa `role-permissions.ts`:
   ```typescript
   export function hasPermission(role: string, required: string[]): boolean {
     if (required.length === 0) return true;
     const granted = ROLE_PERMISSIONS[role] ?? [];
     if (granted.includes('*')) return true;
     return required.every((perm) => granted.includes(perm));
   }
   ```
4. Sửa `permissions.guard.ts`:
   ```typescript
   canActivate(context: ExecutionContext): boolean {
     const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSIONS_KEY, [
       context.getHandler(),
       context.getClass(),
     ]) ?? [];
     if (required.length === 0) return true;
     const { user } = context.switchToHttp().getRequest();
     if (!user || !hasPermission(user.role, required)) {
       throw new ForbiddenException('Insufficient permissions');
     }
     return true;
   }
   ```
5. Chạy `pnpm --filter=api check-types` và `pnpm --filter=api build`.
6. Verify thủ công (không thay test tự động ở Phase 5, nhưng sanity-check trước khi qua phase sau): dev server + curl route có `@Public()` (vd `/health`) không cần token vẫn 200; route khác không token → 401.
7. **[Red-team fix, bắt buộc]** Verify thật cross-module guard order (`ThrottlerGuard` chạy trước `AccessControlModule`'s guards) — code comment ở `app.module.ts:64-72` yêu cầu đúng lúc này. Cách verify: thêm log tạm thời (hoặc dùng test ở Phase 5) xác nhận với 1 route có `@RequirePermissions(...)` + JWT hợp lệ + đủ quyền, request đi qua đúng thứ tự (không bị `PermissionsGuard` chặn nhầm do `request.user` chưa kịp gắn). Nếu phát hiện thứ tự sai thực tế (không đúng giả định), ghi lại finding này và escalate cho user quyết định — KHÔNG tự ý đổi thứ tự đăng ký guard mà không thông báo.

## Success Criteria

- [ ] `JwtAuthGuard` check `@Public()` đúng cả route-level và controller-level.
- [ ] `JwtStrategy.validate()` KHÔNG còn hardcode `role: 'ADMIN'` — tra `UsersService.findById` thật.
- [ ] `hasPermission()` xử lý đúng wildcard `'*'` và permission list rỗng.
- [ ] `PermissionsGuard` throw `ForbiddenException` khi thiếu permission, pass khi không yêu cầu gì.
- [ ] `pnpm --filter=api build` và `check-types` pass.
- [ ] Verify thủ công: `/health` (Public) không cần token vẫn trả 200; route bất kỳ khác không token → 401.
- [ ] Cross-module guard order (`ThrottlerGuard` → `AccessControlModule` guards) đã verify thật, không còn là giả định chưa kiểm chứng.

## Risk Assessment

- **Rủi ro cao nhất trong plan này**: nếu `JwtStrategy.validate()` sai logic (vd quên throw khi user null), lỗi sẽ y hệt bug cũ (mọi token hợp lệ đều pass) nhưng KHÔNG còn dấu hiệu rõ ràng như hardcode `'ADMIN'` — dễ tưởng đã fix nhưng thực ra vẫn broken theo cách tinh vi hơn. Bắt buộc verify bằng Phase 5 (test tự động), không chỉ tin code review đọc mắt.
- Cross-module guard order (`ThrottlerGuard` vs `AccessControlModule`'s guards) là phần thật sự chưa có guarantee — verify thật ở bước 7, không tự ý đổi thứ tự đăng ký nếu phát hiện vấn đề, escalate cho user thay vì tự quyết.

## Security Considerations

`UnauthorizedException` khi user không tồn tại PHẢI dùng message chung chung (không tiết lộ "user id X không tồn tại" cụ thể) — tránh rò rỉ thông tin nội bộ qua error message, dù đây là lỗi xảy ra sau khi JWT đã valid (ít nhạy cảm hơn login, nhưng vẫn nên nhất quán).
