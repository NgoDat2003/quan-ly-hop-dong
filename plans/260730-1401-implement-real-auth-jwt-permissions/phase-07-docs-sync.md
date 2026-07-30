---
phase: 7
title: Docs sync
status: completed
priority: P2
effort: 20m
dependencies:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
---

# Phase 7: Docs sync

## Overview

Cập nhật `README.md` (bảng "những gì đang là stub" không còn đúng sau plan này) và `.agent/projectRules/backend-architecture.md` (ghi lại quyết định bcryptjs/timing-attack/seed pattern) — theo vòng đời docs đã mô tả trong `documentation-management.md`.

## Key Insights

- `README.md` hiện có bảng liệt kê rõ từng stub (`UsersService.findById/findByEmail/create`, `AuthService.login/me`, `JwtAuthGuard.canActivate`, `PermissionsGuard.canActivate`, `JwtStrategy.validate()`, `hasPermission()`, `useAuthActions().login`) — SAU plan này, hầu hết không còn là stub (trừ `UsersService.create()` giữ nguyên theo quyết định Phase 1). README cần phản ánh đúng trạng thái mới, không để thông tin sai gây hiểu nhầm cho người clone sau này.
- Đoạn README "Phần nguy hiểm: không cái nào báo lỗi rõ ràng" mô tả bug cụ thể (`JwtStrategy.validate()` hardcode ADMIN) — đoạn này nên giữ lại dạng lịch sử/cảnh báo giáo dục (why test boundary matters) nhưng làm rõ đây KHÔNG còn là trạng thái hiện tại của code.
- `backend-architecture.md` mục Bootstrap Baseline đã có convention ghi "lý do bắt buộc giữ nguyên" cho từng dòng code quan trọng — nối tiếp thêm bullet cho: bcryptjs (lý do chọn thay vì bcrypt native), timing-attack dummy compare, seed script không tự chạy trong dev/build, `JWT_SECRET` production guard (thêm ở Phase 3 sau red-team review), guard order thật (deterministic same-array vs cross-module không guarantee, làm rõ ở Phase 2).
- **[Red-team fix]** `README.md:90` có dòng `pnpm test # cả 2 app — chỉ 2 spec chứng minh test harness chạy được, không phải test hành vi` — sau Phase 5, dòng này SAI, vì test suite giờ thật sự test hành vi (guard boundary, permission, login). Phải cập nhật dòng này, không chỉ sửa bảng stub.

## Requirements

- Non-functional: README phản ánh đúng trạng thái auth hiện tại (thật, có test), không còn liệt kê các hàm đã implement là "stub".
- Non-functional: Giữ lại phần giải thích "tại sao stub nguy hiểm" dưới dạng bài học/lịch sử, không xoá hoàn toàn — có giá trị giáo dục cho người đọc sau.

## Architecture

Không đổi code — chỉ đọc-sửa `README.md` và `.agent/projectRules/backend-architecture.md`.

## Related Code Files

- Modify: `README.md`
- Modify: `.agent/projectRules/backend-architecture.md`

## Implementation Steps

1. Đọc lại toàn bộ `README.md` hiện tại (đặc biệt dòng 35-57, bảng stub + đoạn "Phần nguy hiểm").
2. Cập nhật bảng stub: xoá các dòng đã implement thật (`UsersService.findById/findByEmail`, `AuthService.login/me`, `JwtAuthGuard.canActivate`, `PermissionsGuard.canActivate`, `JwtStrategy.validate()`, `hasPermission()`, `useAuthActions().login`), GIỮ LẠI dòng `UsersService.create` (vẫn là stub, quyết định có chủ ý).
3. Sửa đoạn "Đăng nhập ở `/login` trông như thành công nhưng không làm gì cả" — không còn đúng, cần viết lại phản ánh: login giờ hoạt động thật, cần seed admin trước (`pnpm --filter=api seed`), hướng dẫn credential mặc định.
4. Giữ lại đoạn "Phần nguy hiểm: không cái nào báo lỗi rõ ràng" nhưng thêm 1 câu làm rõ đây là mô tả trạng thái BAN ĐẦU của base (trước khi có auth thật), không phải trạng thái hiện tại — giá trị là bài học về testing, không phải cảnh báo còn hiệu lực.
5. Thêm hướng dẫn seed vào phần "Setup" của README: `pnpm --filter=api seed` sau `prisma:migrate`.
6. Sửa dòng `README.md:90` (`pnpm test # ...`) — bỏ phần "chỉ 2 spec chứng minh test harness chạy được, không phải test hành vi", thay bằng mô tả đúng: test suite giờ verify hành vi thật (auth boundary, permission check).
7. Sửa `.agent/projectRules/backend-architecture.md` mục Bootstrap Baseline, thêm bullet:
   - Lý do dùng `bcryptjs` thay vì `bcrypt` native (Windows build friction, không cần MSVC toolchain).
   - Lý do dummy `bcryptjs.compare()` khi user không tồn tại (timing attack mitigation).
   - Lý do seed dùng `NestFactory.createApplicationContext(AppModule, {logger: false})` ở `apps/api/scripts/` (NGOÀI `src/`), không tách `SeederModule` (KISS cho base nhỏ) — và lý do vị trí file quan trọng (tránh bị `nest build` cuốn vào compile).
   - Lý do `JWT_SECRET` production guard trong `env.schema.ts` (default chỉ an toàn cho dev, throw rõ ràng nếu `NODE_ENV=production` mà vẫn dùng default).
   - Làm rõ 2 loại guard-order guarantee khác nhau (deterministic same-array `JwtAuthGuard`→`PermissionsGuard` vs. cross-module `ThrottlerGuard` không guarantee) — tránh lặp lại nhầm lẫn đã bị red-team bắt trong quá trình lập plan này.
8. Đọc lại cả 2 file sau khi sửa, xác nhận không mâu thuẫn nội dung cũ, không tham chiếu số phase/tên plan.

## Success Criteria

- [ ] `README.md` bảng stub chỉ còn liệt kê `UsersService.create` (không xoá phần này).
- [ ] `README.md` có hướng dẫn seed admin trong phần Setup.
- [ ] `README.md` đoạn "Phần nguy hiểm" được làm rõ là mô tả lịch sử/bài học, không phải trạng thái hiện tại.
- [ ] `backend-architecture.md` có bullet mới cho bcryptjs/timing-attack/seed pattern/JWT_SECRET guard/guard-order phân loại.
- [ ] `README.md:90` dòng `pnpm test` phản ánh đúng test suite giờ test hành vi thật.
- [ ] Không tham chiếu số phase/tên plan trong nội dung docs.

## Risk Assessment

Rủi ro thấp nhất trong plan — chỉ là doc. Rủi ro duy nhất: quên cập nhật khiến người clone base sau này đọc README cũ, tưởng auth vẫn là stub và không biết cần chạy seed trước khi login.
