# Brainstorm Report — Nâng cấp Auth: Access + Refresh Token cho Base Template

Date: 2026-08-12

## Bối cảnh

Base template (`create-project-from-template`) hiện chỉ có 1 access token JWT sống 7 ngày, lưu `localStorage`, gửi qua `Authorization: Bearer` header. Không có refresh token, không revoke được, README đã ghi nhận đây là trade-off có chủ đích cho giai đoạn skeleton.

So sánh với dự án thật `maycha_QAQC_app` (cùng tổ chức, đã production): có đầy đủ access+refresh token, lưu httpOnly cookie, session tracking trong MongoDB (`authSessions` collection) cho phép revoke/rotate, argon2 thay vì bcrypt, thêm cả Microsoft SSO.

Mục tiêu lần này: nâng chuẩn auth mặc định của base template dùng chung cho mọi dự án tương lai clone ra từ đây — không phải fix riêng 1 dự án.

## Vấn đề với thiết kế hiện tại

- Access token 7 ngày không revoke được — logout chỉ là xóa localStorage phía client, token cũ vẫn hợp lệ tới khi hết hạn tự nhiên.
- localStorage đọc được bằng JS — dễ bị đánh cắp qua XSS.
- Đổi mật khẩu không "đá" được các thiết bị khác đang đăng nhập.
- 1 secret duy nhất dùng chung, không tách access/refresh.

## Các phương án đã đánh giá

### Token storage: localStorage vs httpOnly cookie
Chọn **httpOnly cookie**. Lý do: base dùng chung nhiều dự án tương lai, không biết trước dự án nào sẽ render user-generated content (điều kiện README cũ nêu ra để đổi sang cookie) — nên chuẩn mặc định nên đã an toàn trước XSS ngay từ đầu, không đợi tới lúc cần mới đổi.

### Session tracking: stateless refresh JWT vs DB session
Đánh giá 2 phương án:
- **A. Stateless**: refresh token là JWT ký riêng secret, không lưu DB. Đơn giản nhưng **không revoke được** — logout/đổi mật khẩu không có tác dụng thật, chỉ là hình thức. Not recommended.
- **B. DB session** (chọn): thêm bảng `AuthSession` (Prisma/Postgres, port từ MongoDB schema của `maycha_QAQC_app`), lưu `refreshTokenHash`, `expiresAt`, `revokedAt`. Cho phép revoke thật + rotate + phát hiện refresh token bị tái sử dụng (token theft detection). Chi phí: 1 query DB thêm mỗi lần refresh — chấp nhận được.

Quyết định: refresh-token pattern không lưu DB gần như vô nghĩa về bảo mật so với access-token-dài-hạn hiện tại — giá trị thật nằm ở khả năng revoke, chỉ DB session mới cho được.

### Password hashing: bcrypt vs argon2
Chọn **đổi sang argon2**. OWASP Password Storage Cheat Sheet xếp Argon2id là lựa chọn số 1 hiện tại (chống GPU/ASIC brute-force tốt hơn bcrypt nhờ bắt buộc tốn cả RAM lẫn CPU). Chi phí đổi thấp, không đụng chạm access/refresh token logic. `maycha_QAQC_app` đã dùng argon2 — tín hiệu thực tế đáng tin.

### Microsoft SSO
**Không đưa vào base.** Đây là yêu cầu riêng của `maycha_QAQC_app` (tổ chức dùng Microsoft 365), không phải nhu cầu chung mọi dự án con — giữ base tối giản theo YAGNI, dự án nào cần tự thêm.

### Audit log đăng nhập dài hạn
**Không đưa vào scope lần này.** `AuthSession` chỉ đóng vai trò revoke session đang sống (side-effect: có `ipAddress`/`userAgent`/timestamp giống lịch sử gần nhất, nhưng không phải audit trail vĩnh viễn nếu có cron dọn session hết hạn). Audit log thật (append-only, không xóa) là nhu cầu khác, để dự án con tự thêm khi cần.

## Thiết kế đã chốt

**Prisma schema** — thêm model `AuthSession` (userId, refreshTokenHash, expiresAt, revokedAt, ipAddress, userAgent, lastUsedAt), quan hệ `onDelete: Cascade` với `User`.

**Env config** — tách `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (không dùng chung 1 secret), `JWT_ACCESS_TTL` default 15m (rút ngắn từ 7d vì giờ có refresh bù), `JWT_REFRESH_TTL` default 7d, `AUTH_COOKIE_SECURE`.

**Backend**:
- `POST /auth/login` — set 2 httpOnly cookie thay vì trả `accessToken` trong JSON.
- `POST /auth/refresh` — mới, đọc refresh cookie, verify + tra `AuthSession`, rotate.
- `POST /auth/logout` — mới, revoke session, xóa cookie.
- `GET /auth/me` — giữ nguyên logic.
- `AuthSessionsService` mới (Prisma) — port logic từ `maycha_QAQC_app` (Mongoose → Prisma).
- `AuthService` — đổi `bcryptjs` → `argon2`.
- `JwtStrategy` — đổi extractor từ Bearer header sang đọc cookie (cần `cookie-parser`).

**Frontend**:
- Xóa `apps/web/lib/auth/auth-token.ts` (localStorage) hoàn toàn.
- `http-client.ts` (Orval fetch mutator) — thêm `credentials: 'include'`.
- `use-auth-actions.ts` — bỏ `setToken()`, cookie tự động do browser quản lý.

## Rủi ro & lưu ý

- Breaking change với base cũ, nhưng chưa có dự án thật nào deploy từ base này — rủi ro thấp, chấp nhận được.
- Cookie httpOnly cần đúng CORS/SameSite khi FE/BE khác domain — cần ghi rõ trong README (đặc biệt lúc deploy: subdomain khác nhau cần `SameSite=None; Secure`).
- Test hiện có (`access-control.integration.spec.ts`, `auth.service.spec.ts`) cần viết lại phần đọc token — chuyển từ `response.body.data.accessToken` sang đọc `Set-Cookie` header.
- Cần cập nhật README phần Setup (thêm bước migrate cho bảng `AuthSession` mới) và phần "Lưu ý bảo mật: JWT lưu ở localStorage" (không còn đúng nữa, phải viết lại toàn bộ đoạn đó).

## Next steps

Chuyển sang `/ck:plan` để lập kế hoạch triển khai theo phase (Prisma migration → backend session service/cookie/argon2 → frontend bỏ localStorage → cập nhật test → cập nhật README).

## Unresolved Questions

Không còn — mọi quyết định lớn đã được user chốt qua AskUserQuestion trong phiên brainstorm này.
