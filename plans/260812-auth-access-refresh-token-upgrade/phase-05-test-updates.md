---
phase: 5
title: Test Updates
status: completed
priority: P1
effort: 6h
dependencies:
  - 2
  - 3
---

# Phase 5: Test Updates

## Overview
Cập nhật 2 file test hiện có (`auth.service.spec.ts`, `access-control.integration.spec.ts`) để phản ánh cookie-based auth thay vì Bearer header, và thêm test boundary mới cho refresh/rotate/revoke — đây là phần chứng minh tính năng mới hoạt động đúng, không chỉ "biên dịch được". README hiện tại nhấn mạnh bài học lịch sử: "code chạy được và trả lời thành công không phải là bằng chứng nó làm đúng việc" — áp dụng nguyên vẹn cho phase này.

**[Red Team 2026-08-12]** Effort tăng từ 4h → 6h. Red-team phát hiện 2 vấn đề nghiêm trọng trong bản gốc của phase này:
1. Giả định sai "chỉ đổi cách truyền token, không đổi assertion" cho 8 test case cũ — thực tế Phase 2 đổi cả cách **ký** token (không chỉ cách gửi), nên nếu không chỉnh sửa cách test mint token, cả 8 case sẽ fail vì lý do không liên quan (thiếu secret), không phải vì cookie.
2. Test case "replay detection" quan trọng nhất phase lại chỉ mock `authSessionsService` hoàn toàn — không chứng minh được rotate atomic/CAS hoạt động thật, chỉ chứng minh `AuthService` gọi đúng hàm. Bổ sung hướng dẫn cụ thể hơn để tránh test rỗng.

## Requirements
- Functional: mọi test case cũ (401 khi thiếu token, 403 khi sai permission, user không tồn tại → 401) phải tiếp tục pass sau khi đổi cơ chế đọc token.
- Non-functional: KHÔNG dùng mock/fake để né việc test hành vi rotate/revoke thật — phải test qua `AuthSessionsService` thật (có thể dùng test DB hoặc in-memory Prisma nếu base đã có setup, verify cách test hiện tại kết nối DB thật hay mock `PrismaService`).
- **[Red Team]** Test case race condition (2 refresh song song cùng token) phải verify được qua `AuthSessionsService` thật hoặc ít nhất qua mock có state (không phải mock trả cố định), vì bản chất bug là về thứ tự thực thi/side-effect, không phải input-output đơn thuần.

## Architecture
`access-control.integration.spec.ts` hiện dùng `supertest` với `.set('Authorization', 'Bearer ...')` — đổi sang `.set('Cookie', 'app_access_token=...')` (tên cookie phải khớp constant định nghĩa ở `auth-cookie.constants.ts`, phase 2). `auth.service.spec.ts` hiện mock `usersService`/`jwtService` trực tiếp — cần thêm mock `authSessionsService` và test riêng cho `refresh()`/`logout()`.

**[Red Team] Điểm mấu chốt bị bỏ sót ở bản gốc**: `access-control.integration.spec.ts:58` lấy `JwtService` qua `moduleRef.get(JwtService)` rồi tự `signAsync({ sub })` để mint token test — dựa vào secret mà `AccessControlModule` đăng ký global. Vì Phase 2 (đã sửa theo red-team) **giữ nguyên** `JwtModule.registerAsync` với `JWT_ACCESS_SECRET` làm default, `jwtService.signAsync({ sub })` trong test vẫn hoạt động đúng như cũ **miễn là Phase 2 implement đúng theo bản đã sửa** (không xóa hẳn default secret). Việc của phase này là **verify lại giả định đó đúng**, không phải tự động tin nó đúng — chạy thử suite ngay sau khi Phase 2 xong, trước khi bắt đầu sửa cookie, để cô lập xem lỗi (nếu có) đến từ đâu.

## Related Code Files
- Modify: `apps/api/src/modules/access-control/access-control.integration.spec.ts` — đổi cách gắn token vào request
- Modify: `apps/api/src/modules/auth/auth.service.spec.ts` — thêm mock `authSessionsService`, cập nhật fixture argon2 (đã làm ở phase 3, verify lại ở đây), thêm describe block cho `refresh`/`logout`
- Create: test case mới cho rotation/replay-detection (có thể thêm vào `auth.service.spec.ts` hoặc file riêng tùy độ dài — nếu vượt ngưỡng hợp lý, tách `auth.service.refresh.spec.ts` theo quy tắc modularization của dự án nếu file gốc vượt 200 dòng)
- **[Red Team]** Create/Modify: test riêng cho compare-and-swap rotate — cân nhắc test ở tầng `AuthSessionsService` (unit test với Prisma thật hoặc test DB) thay vì chỉ mock ở tầng `AuthService`, vì đây là nơi logic CAS thực sự nằm

## Implementation Steps
1. **[Red Team] Bước 0 — chạy baseline trước khi sửa gì**: ngay sau Phase 2 xong (trước khi bắt đầu sửa phase này), chạy `pnpm --filter=api test access-control.integration.spec.ts` mà CHƯA đổi gì trong file test. Nếu fail, đọc lỗi để xác nhận nguyên nhân là "chưa đổi cookie" (dự kiến, sẽ sửa ở bước 6) chứ không phải "thiếu secret" (nếu là lỗi này, quay lại Phase 2 kiểm tra `JwtModule.registerAsync` có bị xóa nhầm không — đây chính là Finding của red-team, đảm bảo Phase 2 implement đúng bản đã sửa).
2. Đọc lại `auth.service.spec.ts` hiện tại (đã có sẵn structure `describe('login')`/`describe('me')`) — giữ nguyên các test case cũ, chỉ đổi fixture hash sang argon2 (đã làm ở phase 3, verify không bị bỏ sót).
3. Thêm mock `authSessionsService` vào `AuthService` constructor call trong test:
   ```ts
   const authSessionsService = {
     createSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
     getActiveSessionOrThrow: jest.fn(),
     rotateSessionAtomic: jest.fn(),
     revokeSession: jest.fn(),
     revokeAllUserSessions: jest.fn(),
   };
   ```
4. Cập nhật test `login` hiện có: assertion `result` giờ có shape khác (tokens tách riêng khỏi user response, theo shape đã quyết định cụ thể ở Phase 2 bước Related Code Files — không phải "đọc lại sau", vì Phase 2 đã chốt: service trả `{ user, tokens }`, controller mới là nơi tách `tokens` ra) — sửa `expect(result).toEqual({ user: {...}, tokens: {...} })`.
5. Thêm `describe('refresh', ...)` với các case — **[Red Team] mở rộng từ 3 case gốc lên 5 case**:
   - Refresh token hợp lệ, session còn sống, hash khớp, CAS thành công (`rotateSessionAtomic` trả `count: 1`) → trả token bundle mới.
   - Session không tồn tại/đã revoke (`getActiveSessionOrThrow` throw) → propagate lỗi 401.
   - Hash không khớp verify ban đầu (refresh token cũ, chưa từng rotate nhưng không đúng — trường hợp token giả mạo/sai) → gọi `revokeAllUserSessions` (không phải `revokeSession` đơn lẻ — đây là thay đổi so với bản gốc theo red-team finding), throw 401.
   - **[Red Team, case mới]** CAS trả `count: 0` (race — request khác đã rotate trước) VÀ hash mới khớp token cũ khi kiểm tra lại → KHÔNG revoke, trả lỗi retry-able (không phải 401 cứng) — đây là test case chứng minh race condition không đá nhầm user hợp lệ.
   - **[Red Team, case mới]** CAS trả `count: 0` VÀ hash mới cũng KHÔNG khớp (bất thường thật) → revoke toàn bộ family, throw 401.
   - Test case "hash không khớp → revoke" vẫn là quan trọng nhất, nhưng giờ phải assert đúng: `expect(authSessionsService.revokeAllUserSessions).toHaveBeenCalledWith(session.userId)` — không chỉ `toHaveBeenCalled()`.
6. Thêm `describe('logout', ...)` với case: refresh token hợp lệ → gọi `revokeSession` đúng `sid`; refresh token thiếu/invalid → không throw (logout luôn "thành công" từ phía client), không gọi `revokeSession`.
7. Sửa `access-control.integration.spec.ts`:
   - Đổi mọi `.set('Authorization', \`Bearer ${token}\`)` thành `.set('Cookie', [\`${ACCESS_COOKIE_NAME}=${token}\`])` (import `ACCESS_COOKIE_NAME` từ `auth-cookie.constants.ts` — KHÔNG hardcode string literal trong test, để nếu tên cookie đổi sau này, test tự đồng bộ).
   - Giữ nguyên toàn bộ 8 test case hiện có (401 không token, 401 malformed JWT, 401 user không tồn tại DB, 200 role thật, bypass `@Public()`, 403 thiếu permission, 200 ADMIN wildcard, bypass `@Public()+@RequirePermissions()`) — chỉ đổi cách truyền token, không đổi assertion.
   - Thêm case mới: `GET /test/protected` với access token đã hết hạn (TTL 15m, có thể test bằng cách ký token với `expiresIn: '-1s'` hoặc mock thời gian) → 401.
8. **[Red Team]** Thêm test riêng cho `AuthSessionsService.rotateSessionAtomic` — dùng Prisma thật (kết nối DB test/dev qua `docker compose up -d`, không mock `PrismaService`) hoặc ít nhất giả lập bằng in-memory store có state thật (không phải `jest.fn().mockResolvedValue(...)` cố định) để chứng minh: gọi CAS 2 lần liên tiếp với cùng `oldHash` → lần 2 phải trả `count: 0` (vì lần 1 đã đổi hash rồi, `WHERE refreshTokenHash = oldHash` không còn khớp). Nếu không thể setup DB thật trong thời gian phase này, ghi rõ trong báo cáo hoàn thành đây là gap chưa test được ở tầng integration, chỉ test được ở tầng unit-với-mock — không được âm thầm bỏ qua.
9. Chạy `pnpm --filter=api test` — toàn bộ suite phải pass, không skip test nào.

## Success Criteria
- [x] Toàn bộ 8 test case cũ + 1 mới trong `access-control.integration.spec.ts` pass (9/9) sau khi đổi cookie
- [x] Test case mới: access token hết hạn → 401
- [x] Test case mới trong `auth.service.spec.ts`: refresh hợp lệ → rotate thành công
- [x] Test case mới: hash không khớp (không phải race) → revoke TOÀN BỘ session của user, throw 401 — assert `revokeAllUserSessions` được gọi đúng tham số
- [x] **[Red Team]** Test case race condition: sau code review, đổi thành 2 case rõ ràng hơn — benign race (409, không revoke) vs bất thường thật (revoke family) — assert đúng cả disposition lẫn tham số gọi
- [x] Test case mới: logout → revoke đúng session, không throw khi thiếu/invalid token
- [x] `pnpm --filter=api test` pass toàn bộ (35/35, 4 suite), không skip test nào
- [x] Không dùng mock né tránh phần quan trọng nhất — `auth-sessions.service.integration.spec.ts` dùng Postgres thật (không mock `PrismaService`), chứng minh CAS atomic hoạt động ở tầng SQL thật, không chỉ tầng application logic
- [x] **[Red Team]** Cookie name trong `access-control.integration.spec.ts` import từ `auth-cookie.constants.ts`, không hardcode string literal

## Risk Assessment
- **Đây là phase dễ bị làm hời hợt nhất** — nguy cơ chỉ sửa test cho pass mà không thực sự test hành vi rotate/revoke (ví dụ mock `authSessionsService` trả về success cho mọi trường hợp mà không assert đúng tham số gọi). Phải assert cụ thể tham số gọi, không chỉ `toHaveBeenCalled()`.
- **[Red Team] Rủi ro cụ thể đã từng xảy ra ở bản kế hoạch gốc**: giả định "chỉ đổi cookie, không đổi gì khác" đã sai — bản kế hoạch gốc của phase này đưa ra assumption không kiểm chứng về việc Phase 2 không ảnh hưởng tới cách mint token trong test. Bài học: mọi assumption về "X không đổi" giữa các phase phải verify bằng cách chạy thử trước (xem Implementation Steps bước 1), không suy luận từ mô tả phase khác.
- Nếu `access-control.integration.spec.ts` cần cookie thật từ response (không tự ký JWT thủ công như hiện tại), có thể cần đổi cách setup test hoàn toàn (gọi `/auth/login` thật trong `beforeEach` thay vì tự `jwtService.signAsync`) — đánh giá lại khi thực thi, có thể phát sinh effort cao hơn ước tính.
- **[Red Team] Test DB cho `AuthSessionsService`**: repo hiện không có sẵn test-DB infrastructure (`jest.config.js` không có `globalSetup`, test hiện tại mock `PrismaService` hoàn toàn bằng `{}`). Nếu muốn test CAS thật (bước 8), cần quyết định: dùng `docker compose` Postgres đang chạy sẵn (đơn giản nhất, nhưng test phụ thuộc trạng thái máy dev) hay bỏ qua và chỉ test unit-với-mock-có-state (chấp nhận gap, ghi chú rõ). Quyết định cụ thể khi thực thi, không phải nghĩa vụ phải có test DB đầy đủ nếu chi phí quá cao so với lợi ích cho 1 base template.
