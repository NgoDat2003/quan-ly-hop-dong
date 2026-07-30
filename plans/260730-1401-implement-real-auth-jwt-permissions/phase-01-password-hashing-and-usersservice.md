---
phase: 1
title: Password hashing and UsersService
status: completed
priority: P1
effort: 45m
dependencies: []
---

# Phase 1: Password hashing and UsersService

## Overview

Thêm `bcryptjs` làm password hashing lib, implement `UsersService.findById`/`findByEmail` thật qua Prisma (bỏ `create()` — không có caller, giữ nguyên slot). Đây là nền tảng mọi phase sau phụ thuộc vào.

## Key Insights

- Máy dev hiện tại KHÔNG có MSVC build tools (`cl.exe` not found) — `bcrypt` native sẽ fail build. Dùng `bcryptjs` (thuần JS, cùng API `hash`/`compare`), chấp nhận chậm hơn native 1 chút, không đáng kể ở cost factor 12 cho use case của template.
- `UsersService.findByEmail` hiện trả `Promise<unknown | null>` — cần đổi type trả về đủ để `AuthService.login()` đọc được `password` hash (KHÔNG dùng `UserResponseDto` vì DTO đó không có field `password`, và không nên lộ password hash qua response DTO dùng chung).
- `UsersService.create()` giữ nguyên `throw new Error('not implemented')` — không có endpoint nào gọi nó (xác nhận qua scout), không thuộc scope plan này.
- Prisma `User` model đã có `password: String` sẵn — không cần migration.
- **[Red-team fix]** KHÔNG tự định nghĩa type `UserWithPassword` từ đầu — Prisma đã generate type `User` đầy đủ (`apps/api/src/generated/prisma/`), dùng trực tiếp `import type { User } from '../../generated/prisma/client'` (xác nhận đúng path export lúc code, project đã import `Role` từ `../../generated/prisma/enums` ở chỗ khác theo pattern tương tự). Tự tay định nghĩa lại 5 field trùng với Prisma type có sẵn tạo nguy cơ lệch nhau khi schema đổi sau này (thêm cột mới, Prisma tự cập nhật type nhưng type tự viết tay thì không).

## Requirements

- Functional: `UsersService.findById(id)` trả `UserResponseDto | null` thật từ Prisma (không lộ password).
- Functional: `UsersService.findByEmail(email)` trả đủ dữ liệu để login flow so sánh password (bao gồm password hash) — kiểu trả về riêng, không tái dùng `UserResponseDto`.
- Non-functional: `bcryptjs` cost factor 12 (khớp OWASP recommendation từ research, ~250-500ms/hash).

## Architecture

```
UsersService (Prisma-backed)
├── findById(id): Promise<UserResponseDto | null>     — public-safe shape, không password
├── findByEmail(email): Promise<User | null>  — Prisma-generated type nguyên bản, CÓ password hash, chỉ dùng nội bộ AuthService
└── create(): giữ nguyên throw, không implement (ngoài scope)
```

`User` (Prisma-generated) dùng trực tiếp cho `findByEmail` — không tạo type mới, không phải DTO Swagger (không expose qua API, chỉ dùng nội bộ giữa `AuthService` và `UsersService`).

## Related Code Files

- Modify: `apps/api/package.json` (thêm `bcryptjs`, `@types/bcryptjs`)
- Modify: `apps/api/src/modules/users/users.service.ts`

## Implementation Steps

1. Cài dependency: `pnpm --filter=api add bcryptjs` và `pnpm --filter=api add -D @types/bcryptjs`.
2. Sửa `apps/api/src/modules/users/users.service.ts`:
   - `findById(id: string)`: `this.prisma.user.findUnique({ where: { id } })`, map sang `UserResponseDto` (loại `password` khỏi kết quả trả về — dùng Prisma `select` để không query password thừa, hoặc destructure loại bỏ), trả `null` nếu không tìm thấy.
   - `findByEmail(email: string)`: `this.prisma.user.findUnique({ where: { email } })`, trả nguyên record Prisma (CÓ password) dưới type `User` (Prisma-generated, import từ `../../generated/prisma/client` hoặc path export đúng — xác nhận lúc code), trả `null` nếu không tìm thấy. Hàm này CHỈ dùng nội bộ bởi `AuthService.login()`, không bao giờ serialize thẳng ra response.
3. Chạy `pnpm --filter=api check-types` và `pnpm --filter=api build`.

## Success Criteria

- [ ] `bcryptjs` + `@types/bcryptjs` trong `apps/api/package.json` dependencies/devDependencies đúng chỗ.
- [ ] `UsersService.findById` trả dữ liệu Prisma thật, KHÔNG có field `password` trong response.
- [ ] `UsersService.findByEmail` trả dữ liệu CÓ password hash, chỉ dùng nội bộ.
- [ ] `pnpm --filter=api build` và `check-types` pass.

## Risk Assessment

Rủi ro thấp — thay đổi cô lập trong 1 service, chưa ai gọi các hàm này thật (guard/login vẫn stub tới Phase 2/3), nên không có regression runtime ở phase này. Rủi ro duy nhất: quên loại `password` khỏi `findById` response — review kỹ ở code-review gate.

## Security Considerations

`findByEmail` trả password hash — PHẢI ghi rõ trong code comment rằng hàm này không được dùng ngoài `AuthService`, không serialize trực tiếp ra API response. Không hash password ở layer này — hashing xảy ra ở seed script (Phase 4) và bất kỳ chỗ tạo user nào trong tương lai, không phải trong `UsersService`.
