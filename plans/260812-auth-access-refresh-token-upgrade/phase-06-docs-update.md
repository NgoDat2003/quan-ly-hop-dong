---
phase: 6
title: Docs Update
status: completed
priority: P2
effort: 2h
dependencies:
  - 1
  - 2
  - 3
  - 4
  - 5
---

# Phase 6: Docs Update

## Overview
Cập nhật toàn bộ tài liệu mô tả auth cũ (README gốc, `apps/api/src/modules/README.md`, `docs/backend-config-baseline-explained.md`, `docs/security-audit-full-project.md`) để không còn mô tả sai trạng thái code sau khi phase 1-5 hoàn tất. Đây là bước bắt buộc theo `documentation-management.md` — tài liệu sai lệch còn nguy hiểm hơn không có tài liệu, vì ai đọc README sau này sẽ tin nhầm base vẫn dùng localStorage/1-token.

**[Red Team 2026-08-12]** 2 sửa quan trọng so với bản gốc:
1. **KHÔNG được viết "đổi mật khẩu revoke toàn bộ thiết bị khác"** vào bất kỳ file nào — plan này (kể cả sau khi áp dụng mọi fix từ red-team) **không implement change-password endpoint**, nên `revokeAllUserSessions` chỉ có 1 call site thật (nhánh replay-detection ở Phase 2, không phải đổi mật khẩu). Viết claim này vào docs là tài liệu nói dối về tính năng không tồn tại — đúng thứ mà README hiện tại tự cảnh báo là nguy hiểm nhất.
2. **Không được xóa cảnh báo CSRF mà không thay bằng cảnh báo tương đương** — bản gốc chỉ nói "xóa đoạn trade-off cũ", nhưng Phase 2 (đã sửa) thêm Origin-check guard làm compensating control tối thiểu, không phải miễn nhiễm hoàn toàn như thiết kế Bearer cũ. README phải phản ánh đúng mức độ bảo vệ mới, không phải im lặng bỏ qua chủ đề.
3. Thêm `docs/security-audit-full-project.md` vào phạm vi — file này (không commit git theo ghi chú ở `backend-config-baseline-explained.md`) có dòng xác nhận "CSRF không áp dụng cho mô hình auth này theo đúng thiết kế" — câu này sai hoàn toàn sau khi đổi sang cookie, phải cập nhật hoặc xóa nếu không còn đúng.

## Requirements
- Functional: không còn đoạn văn nào trong 3 file trên mô tả "chỉ có access token", "lưu localStorage", "không có refresh token" như hiện trạng — phải phản ánh đúng access+refresh+cookie+AuthSession.
- Non-functional: giữ nguyên văn phong/cấu trúc hiện có của từng file (README dùng bảng, `docs/backend-config-baseline-explained.md` dùng format "Dòng | Cấu hình | Tại sao").

## Architecture
Không có thay đổi code — chỉ đồng bộ hóa tài liệu với code thật sau 5 phase trước. Đây là lý do phase này `dependencies: [1, 2, 3, 4, 5]` — phải chạy sau cùng, không thể viết tài liệu trước khi biết chắc implementation cuối cùng trông ra sao (ví dụ tên cookie thật, TTL thật đã chọn).

## Related Code Files
- Modify: `README.md` (root) — mục "Lưu ý bảo mật: JWT lưu ở localStorage" (dòng 56-60), mục "Những gì vẫn còn là stub" (dòng 38-44), phần Setup (dòng 20-31)
- Modify: `apps/api/src/modules/README.md` — mục "Những gì vẫn còn là stub trong base này" (dòng 49-56, đã lỗi thời từ trước phiên này, cần dọn luôn)
- Modify: `docs/backend-config-baseline-explained.md` — mục 3.5 (JwtStrategy), 3.7 ("JWT_EXPIRES_IN mặc định 7d, không có refresh token"), bảng "Khoảng trống đã biết" mục 3 (thứ tự APP_GUARD) và mục 6 (audit-log — làm rõ AuthSession KHÔNG phải audit log, tránh gây hiểu nhầm ngược lại)
- **[Red Team] Modify: `docs/security-audit-full-project.md`** — tìm và sửa/xóa dòng xác nhận "CSRF không áp dụng" (nếu file tồn tại và có dòng này — file này có thể không commit git, verify trước khi giả định nó tồn tại)
- Check: `.env.example` — thêm các biến mới (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `AUTH_COOKIE_SECURE`), xóa/giữ `JWT_SECRET`/`JWT_EXPIRES_IN` cũ tùy quyết định thực thi ở phase 2 (nếu phase 2 xóa hẳn secret cũ, `.env.example` phải khớp)

## Implementation Steps
1. **`README.md` root**:
   - Sửa mục "Lưu ý bảo mật: JWT lưu ở localStorage" (dòng 56-60) — **[Red Team] đổi tên mục thành "Lưu ý bảo mật: cookie-based auth + CSRF"**, viết lại thành mô tả cơ chế mới: access+refresh qua httpOnly cookie, path riêng cho refresh cookie (`/auth`, không phải `/`), `AuthSession` cho phép revoke session bị nghi ngờ đánh cắp (replay detection tự động revoke toàn bộ session của user khi phát hiện token cũ bị tái sử dụng). **KHÔNG được viết** "đổi mật khẩu revoke toàn bộ thiết bị khác" — tính năng này không tồn tại trong plan. Thêm đoạn mới thay thế cảnh báo CSRF cũ: nêu rõ base mặc định dùng `SameSite=Strict/Lax` + Origin-check guard làm compensating control tối thiểu, và nếu dự án con cần `SameSite=None` (deploy FE/BE khác domain hoàn toàn) thì bắt buộc tự thêm CSRF token đầy đủ (double-submit hoặc tương đương) — không phải mặc định của base.
   - Sửa mục "Những gì vẫn còn là stub" — không đổi (chỉ `UsersService.create`), nhưng cập nhật câu mô tả auth ở dòng 44 để phản ánh đúng danh sách hàm mới (`AuthService.refresh`/`logout`, `AuthSessionsService`). **[Red Team]** Cân nhắc thêm 1 dòng: "change-password endpoint chưa tồn tại — `AuthSessionsService.revokeAllUserSessions` hiện chỉ được gọi từ nhánh replay-detection, chưa có UI/API đổi mật khẩu nào gọi tới nó" — để rõ ràng đây là extension point, không phải tính năng hoàn chỉnh.
   - Thêm 1 dòng trong phần Setup nếu migration mới (phase 1) cần bước riêng — thường `prisma:migrate` đã cover, verify không cần thêm dòng lệnh mới.
   - Cập nhật đoạn dòng 3-4 (banner cảnh báo đầu file) nếu cần — verify còn đúng ("Auth đã implement thật") sau khi đổi cơ chế.
2. **`apps/api/src/modules/README.md`**:
   - Xóa hẳn mục "Những gì vẫn còn là stub trong base này" (dòng 49-56) — nội dung này đã lỗi thời từ TRƯỚC phiên làm việc này (mô tả trạng thái stub ban đầu của base, không phải trạng thái sau phase 1-5), gây nhầm lẫn nếu để nguyên. Thay bằng ghi chú ngắn trỏ tới README root và `docs/backend-config-baseline-explained.md` để tránh trùng lặp 2 nguồn sự thật.
3. **`docs/backend-config-baseline-explained.md`**:
   - Mục 3.5 (`JwtStrategy`) — viết lại đoạn `secretOrKey`/`jwtFromRequest` theo cơ chế cookie mới, 2 secret riêng.
   - Mục 3.7 — đổi tiêu đề và nội dung, không còn đúng "không có refresh token". Viết lại thành mô tả `AuthSession`/rotate/revoke, giữ format "Tại sao" nhất quán với các mục khác trong file.
   - Bảng "Khoảng trống đã biết" mục 3 (thứ tự `APP_GUARD` chưa test) — giữ nguyên nếu phase 5 KHÔNG thêm test integration xác nhận thứ tự guard (đây là khoảng trống độc lập, không nằm trong scope plan này) — verify lại sau phase 5 xem có vô tình đã cover chưa.
   - Bảng "Khoảng trống đã biết" mục 6 ("Không có audit-log table") — thêm 1 câu làm rõ: `AuthSession` mới thêm KHÔNG phải audit-log (không append-only, bị xóa/update khi rotate/revoke) — tránh người đọc sau này tưởng nhầm khoảng trống #6 đã được lấp.
4. **`.env.example`**: đồng bộ với biến env thật đã implement ở phase 2 — copy đúng tên biến, comment giải thích ngắn theo pattern đã có (xem comment hiện tại về `JWT_SECRET` làm mẫu).
5. **[Red Team] `docs/security-audit-full-project.md`**: kiểm tra file có tồn tại không (ghi chú ở `backend-config-baseline-explained.md:5` nói file này "không commit git" — có thể chỉ tồn tại local). Nếu tồn tại, tìm dòng xác nhận CSRF không áp dụng (dạng "CSRF không áp dụng cho mô hình auth này theo đúng thiết kế") và sửa/xóa vì không còn đúng.
6. Grep toàn repo (trừ `node_modules`, `.next`, `dist`, `generated`) cho `localStorage`, `Bearer`, `accessToken`, `CSRF` trong context auth để bắt các chỗ mô tả rải rác chưa cập nhật (ví dụ comment trong code khác ngoài phạm vi đã sửa ở phase 2/4).

## Success Criteria
- [x] `README.md` không còn đoạn nào mô tả localStorage là cơ chế lưu token hiện tại
- [x] `README.md` không có claim "đổi mật khẩu revoke toàn bộ thiết bị" — thay bằng ghi rõ tính năng đó chưa tồn tại, chỉ có 1 call site thật (replay-detection)
- [x] `README.md` mô tả đúng mức độ bảo vệ CSRF mới (SameSite + OriginCheckGuard, giới hạn rõ khi cần double-submit token đầy đủ)
- [x] `apps/api/src/modules/README.md` không còn liệt kê auth guard/JwtStrategy là "stub" — thay bằng trỏ tới README root + docs baseline
- [x] `docs/backend-config-baseline-explained.md` mục 3.7 mô tả đúng cơ chế access+refresh+AuthSession, mục 3.5/3.6 cũng cập nhật theo
- [x] `.env.example` liệt kê đủ biến env mới, biến cũ đã xóa khỏi code không còn xuất hiện
- [x] Grep `localStorage` trong toàn repo không còn kết quả liên quan auth token
- [x] **[Red Team]** Grep "đổi mật khẩu revoke" trong docs thật (README, docs/) trả về 0 kết quả — chỉ còn xuất hiện trong `plan.md`/phase file (mô tả finding lịch sử, không phải claim về code), đúng như mong đợi

## Risk Assessment
- Rủi ro thấp — thuần cập nhật tài liệu, không đổi hành vi code. Rủi ro chính là **bỏ sót** 1 trong 3 file (đặc biệt `docs/backend-config-baseline-explained.md` khá dài, dễ bỏ sót đoạn liên quan nằm rải rác ở nhiều mục khác nhau — mục 3.5, 3.6, 3.7 đều nhắc tới JWT).
- Cần đọc lại toàn bộ file `docs/backend-config-baseline-explained.md` một lượt cuối sau khi sửa để đảm bảo không có mục nào tự mâu thuẫn với mục khác (ví dụ mục 1 nói CORS `credentials: true` đã có sẵn — giờ phải nhấn mạnh đây là điều kiện BẮT BUỘC cho cookie auth hoạt động, không còn là "chuẩn bị sẵn cho tương lai" nữa).
