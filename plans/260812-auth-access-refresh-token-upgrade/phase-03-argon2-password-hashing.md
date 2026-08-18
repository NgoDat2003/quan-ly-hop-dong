---
phase: 3
title: Argon2 Password Hashing
status: completed
priority: P2
effort: 3h
dependencies: []
---

# Phase 3: Argon2 Password Hashing

## Overview
Đổi `bcryptjs` sang `argon2` (Argon2id — mặc định của package `argon2` npm) cho hash/verify password. OWASP Password Storage Cheat Sheet xếp Argon2id là lựa chọn số 1 hiện tại, chống GPU/ASIC brute-force tốt hơn bcrypt (tốn cả RAM lẫn CPU).

**[Red Team 2026-08-12]** Effort tăng từ 1.5h → 3h — red-team xác nhận bằng cách đọc trực tiếp `apps/api/Dockerfile` rằng `node:20-alpine` (musl libc) không có build toolchain (`python3`/`make`/`g++`) ở bất kỳ stage nào, và stage `runner` copy `node_modules` từ `pnpm --prod deploy` (dòng 35) — một dependency-resolve **riêng biệt** với stage `build`, có nguy cơ không giữ lại native binding đã compile đúng cách. Đây là native dependency ĐẦU TIÊN của repo (hiện tại toàn bộ `apps/api/package.json` là pure-JS). Docker build thành công + chạy được trong container giờ là success criterion bắt buộc, không phải "nice to have". `dependencies: []` giữ nguyên (không phụ thuộc AuthSession) nhưng **không được làm song song với Phase 2** — cả 2 phase cùng sửa `auth.service.ts:login()`, xem lưu ý bên dưới.

## Requirements
- Functional: user hiện có (hash bcrypt cũ trong DB, nếu có) không bị khóa khỏi hệ thống đột ngột — nhưng vì đây là base template chưa deploy dự án thật (theo README), KHÔNG cần logic migrate-on-login phức tạp (verify bcrypt cũ rồi re-hash argon2) — chỉ cần đổi hash/verify function, seed lại từ đầu.
- Non-functional: giữ nguyên hành vi chống timing-attack (dòng `DUMMY_HASH` compare khi email không tồn tại) — argon2 cũng cần 1 dummy hash tương đương, **với tham số (memoryCost/timeCost) cố định giống hệt tham số dùng ở mọi lệnh `argon2.hash` thật khác** (xem Risk Assessment — lệch tham số phá vỡ mục đích timing-safety).
- **[Red Team]** `docker build` + `docker run` cho `apps/api` phải thành công sau khi đổi dependency — đây là success criterion cứng, không phải rủi ro ghi chú rồi bỏ qua.

## Architecture
Thay `bcryptjs.hash`/`bcryptjs.compare` bằng `argon2.hash`/`argon2.verify` tại các điểm gọi trực tiếp. Argon2id không cần "cost factor" dạng số nguyên đơn giản như bcrypt.

**[Red Team]** Không dùng tham số mặc định "tùy ý" của package — vì Phase 2 dùng `argon2.hash` cho refresh token với tần suất cao (mỗi lần refresh, TTL 15 phút → có thể hàng chục lần/giờ/user active), tham số mặc định (64 MiB RAM, ~50-100ms CPU mỗi lần verify) trên 1 endpoint `@Public()` (`/auth/refresh`) là vector DoS đáng cân nhắc nếu không có rate-limit (Phase 2 đã thêm `@Throttle` riêng cho việc này — 2 phase phối hợp, không độc lập hoàn toàn về mặt bảo mật dù độc lập về code path). Pin tường minh tham số OWASP minimum: `memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1` — thấp hơn default của package nhưng vẫn đạt khuyến nghị OWASP tối thiểu, giảm tải cho endpoint public tần suất cao.

## Related Code Files
- Modify: `apps/api/src/modules/auth/auth.service.ts` — đổi import, đổi `DUMMY_HASH` sang hash argon2 hợp lệ (tham số pin cố định), đổi `bcryptjs.compare` → `argon2.verify`
- Modify: `apps/api/scripts/seed-admin.ts` — đổi `bcryptjs.hash` → `argon2.hash` (cùng tham số pin)
- Modify: `apps/api/package.json` — thêm dependency `argon2`, xóa `bcryptjs` (và `@types/bcryptjs` nếu có) nếu không còn nơi nào dùng
- Modify: `apps/api/src/modules/auth/auth.service.spec.ts` — đổi test dùng `bcryptjs.hash` sang `argon2.hash` khi tạo fixture user
- **[Red Team] Modify: `apps/api/Dockerfile`** — thêm build toolchain vào stage cần compile native addon, verify artifact sống sót qua `pnpm --prod deploy`

## Implementation Steps
1. **[Red Team] Trước khi bắt đầu — xác nhận thứ tự với Phase 2**: cả phase này và Phase 2 đều sửa `auth.service.ts` hàm `login()` (Phase 2 thêm session/token bundle, Phase 3 đổi cách verify password). Làm phase này **trước** Phase 2, hoặc merge cả 2 thay đổi vào cùng 1 lượt sửa `login()` — không giao cho 2 người/2 phiên làm việc song song trên cùng function, sẽ dễ conflict/mất thay đổi.
2. Cài `argon2`: `pnpm --filter=api add argon2`. Verify cài đặt thành công trên Windows dev machine trước khi tiếp tục.
3. Gỡ `bcryptjs` nếu không còn chỗ nào dùng sau khi đổi hết: `pnpm --filter=api remove bcryptjs`.
4. Sửa `auth.service.ts`:
   - Đổi `import * as bcryptjs from 'bcryptjs'` → `import * as argon2 from 'argon2'`.
   - Định nghĩa 1 constant tham số dùng chung, ví dụ `const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }`, dùng cho MỌI lệnh `argon2.hash` trong cả `auth.service.ts` và `seed-admin.ts` (copy hằng số, không để mỗi nơi tự chọn tham số khác nhau — nếu khác, timing giữa các nhánh verify sẽ khác nhau, phá vỡ mục đích chống timing-attack của `DUMMY_HASH`).
   - Sinh `DUMMY_HASH` mới bằng argon2 VỚI ĐÚNG `ARGON2_OPTIONS` ở trên (chạy 1 lần offline, paste chuỗi kết quả cố định vào code — giữ nguyên comment giải thích mục đích chống timing attack, thêm ghi chú rằng tham số phải khớp mọi hash thật khác).
   - Đổi `bcryptjs.compare(dto.password, DUMMY_HASH)` → `argon2.verify(DUMMY_HASH, dto.password)` (chú ý argon2 API thứ tự tham số là `(hash, plain)`, ngược với bcrypt `(plain, hash)` — dễ nhầm, phải kiểm tra kỹ).
   - Đổi `bcryptjs.compare(dto.password, user.password)` → `argon2.verify(user.password, dto.password)` (cùng lý do thứ tự tham số).
5. Sửa `seed-admin.ts`: đổi `bcryptjs.hash(ADMIN_PASSWORD, 12)` → `argon2.hash(ADMIN_PASSWORD, ARGON2_OPTIONS)` (import cùng hằng số tham số từ bước 4, không hardcode riêng — cân nhắc đặt `ARGON2_OPTIONS` ở 1 file dùng chung nếu cả 2 nơi cần import, ví dụ `apps/api/src/modules/auth/argon2-options.constant.ts`).
6. Sửa `auth.service.spec.ts`: đổi `bcryptjs.hash('correct-password', 4)` → `argon2.hash('correct-password', ARGON2_OPTIONS)` ở 2 chỗ dùng làm fixture.
7. **[Red Team] Sửa `apps/api/Dockerfile`**:
   - Stage `deps` (dòng 17-24) hoặc stage `build` (dòng 27-33) — thêm `RUN apk add --no-cache python3 make g++` **trước** bước `pnpm install`, để `node-gyp` có toolchain build native addon nếu không tìm được prebuilt binary phù hợp musl.
   - Verify artifact sống sót qua `pnpm --filter api --prod deploy /deploy/api` (dòng 35) — chạy thử `docker build` thật, sau đó `docker run` container và thử login qua API để xác nhận `argon2` không throw `ERR_DLOPEN_FAILED` lúc runtime (lỗi này CHỈ xuất hiện lúc chạy, không xuất hiện lúc `docker build` nếu binary bị thiếu nhưng file khác vẫn copy được).
   - Nếu build/run vẫn fail sau khi thêm toolchain (ví dụ do multi-stage copy không giữ đúng binary), cân nhắc phương án dự phòng: đổi sang package `@node-rs/argon2` (có prebuilt binary cho musl, không cần toolchain) — chỉ áp dụng nếu bước trên thất bại thật, không đổi trước khi thử cách chính.
8. Chạy seed lại (`pnpm --filter=api seed`) để user admin trong DB dev có hash argon2 mới — hash bcrypt cũ (nếu DB dev đã có từ trước) sẽ không verify được nữa, đây là hành vi chấp nhận được cho base template (không phải migrate dữ liệu production thật).

## Success Criteria
- [x] `argon2` cài đặt thành công, build native binding không lỗi trên máy dev (Windows) — `pnpm approve-builds argon2` chạy `node-gyp-build`, tìm được prebuilt binary
- [x] Login với `admin@example.com`/`admin12345` (sau khi seed lại) thành công — verify qua curl thật + qua Docker container thật
- [x] Login với password sai vẫn trả 401 với thông điệp chung — verify qua unit test `auth.service.spec.ts`
- [x] `auth.service.spec.ts` pass với fixture argon2 mới
- [x] Không còn import `bcryptjs` ở bất kỳ đâu trong `apps/api/src` — grep xác nhận 0 kết quả, package đã gỡ khỏi `package.json`
- [x] **[Red Team] `docker build -f apps/api/Dockerfile .` thành công** — phát hiện thêm 2 lỗi tiền tồn tại không liên quan argon2 lúc build thật (Node version mismatch với pnpm@11.2.2, `pnpm deploy` cần `--legacy`), đã sửa cả 2 cùng lúc
- [x] **[Red Team] `docker run` container thật, `POST /auth/login` thành công (200), không `ERR_DLOPEN_FAILED`** — verify qua container chạy thật kết nối Postgres host, login trả JWT hợp lệ
- [x] `ARGON2_OPTIONS` dùng nhất quán — 1 file constant (`argon2-options.constant.ts`) import ở cả `auth.service.ts` và `seed-admin.ts`

## Risk Assessment
- **[Red Team] Docker/Alpine build là rủi ro chính đã được giải quyết ở Implementation Steps bước 7** — không còn là rủi ro "để verify sau", mà là bước làm cụ thể với hành động rõ ràng (thêm toolchain) và success criterion cứng.
- Thứ tự tham số `argon2.verify(hash, plain)` ngược với `bcryptjs.compare(plain, hash)` — lỗi dễ mắc phải nếu copy-paste không cẩn thận, gây lỗi logic âm thầm (luôn trả false hoặc luôn throw) — bắt buộc có test case verify cả 2 chiều đúng/sai để bắt lỗi này ngay (đã có sẵn trong `auth.service.spec.ts`, chỉ cần chạy lại).
- **[Red Team] Rủi ro thứ tự thực hiện với Phase 2**: cả 2 phase sửa cùng 1 function (`login()`), xem Implementation Steps bước 1 — không tuân thủ thứ tự sẽ gây conflict hoặc mất thay đổi của 1 trong 2 phase.
