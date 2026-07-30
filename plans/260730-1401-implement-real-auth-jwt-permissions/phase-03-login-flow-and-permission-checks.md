---
phase: 3
title: Login flow and permission checks
status: completed
priority: P1
effort: 45m
dependencies:
  - 1
  - 2
---

# Phase 3: Login flow and permission checks

## Overview

Implement `AuthService.login()` (tìm user, so sánh password hash, ký JWT thật) và `AuthService.me()` (tra user thật thay vì trả `STUB_USER`). Áp dụng timing-attack mitigation theo research: dummy `bcryptjs.compare()` khi user không tồn tại.

## Key Insights

- `AuthService.login()` hiện trả `{accessToken: 'stub-token', user: STUB_USER}` bất kể `_dto` — cần dùng `UsersService.findByEmail` (trả kèm password hash, từ Phase 1) + `bcryptjs.compare`.
- Timing attack: nếu route trả lỗi "user không tồn tại" nhanh hơn "sai password", kẻ tấn công dò được email nào tồn tại trong hệ thống qua response time. Mitigation: khi user không tồn tại, vẫn chạy `bcryptjs.compare()` với 1 dummy hash để giữ thời gian phản hồi tương đương.
- Error message PHẢI generic: `'Invalid email or password'` cho cả 2 trường hợp (user không tồn tại / sai password) — không tiết lộ trường hợp nào đúng.
- **[Red-team fix, security hardening đã chốt qua AskUserQuestion]** `JWT_SECRET` fallback `'dev-placeholder-secret'` là giá trị public, nằm trong source code — nếu ai deploy skeleton này ra production thật mà quên set biến môi trường, JWT_SECRET vẫn "hợp lệ" (không throw lỗi boot) nhưng là secret ai cũng biết, cho phép tự ký JWT giả mạo bất kỳ user id nào, bypass toàn bộ guard logic vừa xây ở Phase 2. Thêm 1 guard nhỏ trong `env.schema.ts` (không phải trong `JwtStrategy`): nếu `NODE_ENV === 'production'` và `JWT_SECRET` vẫn là giá trị default, throw lỗi boot rõ ràng thay vì âm thầm chạy với secret công khai. Đây KHÔNG phải 1 trong 5 chỗ stub gốc, nhưng là fix rẻ (3 dòng), ngăn 1 lớp rủi ro nghiêm trọng phát sinh trực tiếp từ việc auth giờ đã "thật" — chấp nhận nhỏ scope creep có chủ đích.
- **[Red-team fix]** `LoginDto.password` hiện chỉ có `@MinLength(8)`, không có `@MaxLength` — input dài bất thường vẫn được đưa vào `bcryptjs.compare()` (implementation JS thuần, không cap sẵn), tạo khả năng CPU exhaustion nhẹ qua request lặp lại. Thêm `@MaxLength(72)` (giới hạn hiệu quả của bcrypt) vào `LoginDto` — 1 dòng, rẻ, đóng vector này.

## Requirements

- Functional: `login(dto)` — email tồn tại + password đúng → trả `{accessToken, user}` với JWT ký thật (`payload: {sub: user.id}`), `user` là `UserResponseDto` (không có password).
- Functional: `login(dto)` — email không tồn tại HOẶC password sai → `UnauthorizedException('Invalid email or password')`, cùng message, thời gian phản hồi gần tương đương (dummy compare).
- Functional: `me(userId)` — trả `UsersService.findById(userId)` thật, throw nếu không tồn tại (dù về lý thuyết `userId` tới từ JWT đã qua `JwtAuthGuard`/`JwtStrategy` validate ở Phase 2 nên luôn tồn tại — vẫn giữ safety check).

## Architecture

```
POST /auth/login (Public)
  → AuthService.login(dto)
    → UsersService.findByEmail(dto.email)   [Phase 1, trả kèm password hash]
    → user tồn tại?
        no  → bcryptjs.compare(dto.password, DUMMY_HASH) [chỉ để giữ timing, kết quả bỏ qua]
              → throw UnauthorizedException('Invalid email or password')
        yes → bcryptjs.compare(dto.password, user.password)
              → match?  no  → throw UnauthorizedException('Invalid email or password')
                        yes → jwtService.signAsync({ sub: user.id })
                              → { accessToken, user: toUserResponseDto(user) }

GET /auth/me (protected, JwtAuthGuard chạy trước qua Phase 2)
  → AuthService.me(userId từ @CurrentUser())
    → UsersService.findById(userId)
```

## Related Code Files

- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (đã xác nhận qua red-team review: `me()` đã truyền đúng `user?.id` từ `@CurrentUser()` sẵn tại `auth.controller.ts:29` — không cần sửa, chỉ verify lại lúc code)
- Modify: `apps/api/src/modules/auth/dto/login.dto.ts` (thêm `@MaxLength(72)`)
- Modify: `apps/api/src/config/env.schema.ts` (thêm production guard cho `JWT_SECRET`)

## Implementation Steps

1. Sửa `auth.service.ts`, xoá `STUB_USER`:
   ```typescript
   const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8/pkFN5ZP/kD.EPZUJ4kBw7WgXTvVe'; // bcryptjs hash của 1 chuỗi cố định, chỉ dùng giữ timing

   async login(dto: LoginDto): Promise<AuthResultDto> {
     const user = await this.usersService.findByEmail(dto.email);
     if (!user) {
       await bcryptjs.compare(dto.password, DUMMY_HASH);
       throw new UnauthorizedException('Invalid email or password');
     }
     const passwordMatches = await bcryptjs.compare(dto.password, user.password);
     if (!passwordMatches) {
       throw new UnauthorizedException('Invalid email or password');
     }
     const accessToken = await this.jwtService.signAsync({ sub: user.id });
     return { accessToken, user: toUserResponseDto(user) };
   }

   async me(userId: string | undefined): Promise<UserResponseDto> {
     if (!userId) throw new UnauthorizedException();
     const user = await this.usersService.findById(userId);
     if (!user) throw new UnauthorizedException();
     return user;
   }
   ```
   `toUserResponseDto` — hàm map nhỏ loại `password` khỏi Prisma `User` (Phase 1), có thể inline hoặc đặt cạnh `UsersService` nếu dùng lại nhiều nơi (đánh giá lúc code, tránh over-engineer nếu chỉ dùng 1 chỗ).
2. Sửa `login.dto.ts`, thêm `@MaxLength(72)` bên cạnh `@MinLength(8)` đã có cho field `password`.
3. Sửa `env.schema.ts`, thêm production guard cho `JWT_SECRET` — ví dụ trong `validateEnv()`, sau khi parse xong: nếu `result.data.NODE_ENV === 'production' && result.data.JWT_SECRET === 'dev-placeholder-secret'`, throw lỗi rõ ràng ("JWT_SECRET must be set explicitly in production, refusing to boot with the default dev secret"). Không đổi fallback default (vẫn giữ khả năng boot không cần `.env` ở dev/test), chỉ chặn khi `NODE_ENV=production` cụ thể.
4. `auth.controller.ts` — đã xác nhận không cần sửa (xem Related Code Files), chỉ đọc lại để verify.
5. Chạy `pnpm --filter=api check-types` và `pnpm --filter=api build`.
6. Verify thủ công: cần user thật trong DB để test login — phase này CHƯA có seed script (Phase 4), nên verify login đầy đủ sẽ dời sang sau Phase 4. Ở phase này chỉ verify: build pass, `login()` với email không tồn tại trả 401 với message đúng (test qua curl, DB rỗng vẫn đủ để trigger nhánh "user không tồn tại").
7. Verify `NODE_ENV=production JWT_SECRET=dev-placeholder-secret pnpm --filter=api dev` (set biến tạm) → app từ chối boot với lỗi rõ ràng. Sau đó unset lại để không ảnh hưởng dev bình thường.

## Success Criteria

- [ ] `AuthService.login()` không còn `STUB_USER`/`'stub-token'` cứng.
- [ ] Login sai (email không tồn tại hoặc sai password) → 401, message `'Invalid email or password'` giống nhau cho cả 2 trường hợp.
- [ ] `AuthService.me()` tra user thật.
- [ ] `pnpm --filter=api build` và `check-types` pass.
- [ ] Verify thủ công: login với email không tồn tại (DB rỗng) → 401 đúng message.
- [ ] `LoginDto.password` có cả `@MinLength(8)` và `@MaxLength(72)`.
- [ ] App từ chối boot khi `NODE_ENV=production` và `JWT_SECRET` vẫn là giá trị default.

## Risk Assessment

Rủi ro trung bình — logic login là điểm vào chính của hệ thống auth, lỗi ở đây ảnh hưởng toàn bộ. Giảm rủi ro bằng Phase 5 (test boundary tự động) verify lại toàn chuỗi sau khi có seed data thật.

## Security Considerations

- Timing attack mitigation là bắt buộc theo research — không bỏ qua bước dummy compare dù có vẻ thừa khi test thủ công (tác dụng chỉ thấy được qua đo timing thật, không qua chức năng).
- `DUMMY_HASH` là hash cố định, không phải secret — an toàn để hardcode trong source, KHÔNG dùng nó làm password thật cho bất kỳ tài khoản nào.
