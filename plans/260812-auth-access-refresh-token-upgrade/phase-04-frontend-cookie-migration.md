---
phase: 4
title: Frontend Cookie Migration
status: completed
priority: P1
effort: 4h
dependencies:
  - 2
---

# Phase 4: Frontend Cookie Migration

## Overview
Xóa toàn bộ logic quản lý token thủ công ở FE (`localStorage`) — cookie httpOnly do backend set/đọc, browser tự động đính kèm vào mọi request cùng origin. FE cần đảm bảo `fetch` gửi kèm cookie (`credentials: 'include'`) VÀ tự động gọi `/auth/refresh` khi access token hết hạn.

**[Red Team 2026-08-12]** Effort tăng từ 2h → 4h — red-team phát hiện phase gốc chỉ có việc XÓA code (localStorage), không có gì THÊM để làm mới access token khi hết hạn. Với access TTL rút xuống 15 phút (từ 7 ngày), thiếu cơ chế này nghĩa là mọi user bị đăng xuất sau đúng 15 phút mỗi phiên — tệ hơn hành vi hiện tại, không phải cải tiến. Đây là phần bổ sung quan trọng nhất của phase.

## Requirements
- Functional: sau khi phase 2 xong (backend set cookie), login/logout/`/me` vẫn hoạt động đúng qua FE mà không cần đọc/ghi token ở bất kỳ đâu trong `apps/web`.
- **[Red Team] Functional: khi access token hết hạn (401 từ API), FE tự động gọi `/auth/refresh` một lần và replay lại request gốc — người dùng không bị gián đoạn hay thấy lỗi, trừ khi refresh cũng thất bại (khi đó mới redirect `/login`).**
- Non-functional: không còn code nào đọc `window.localStorage` cho auth token — xóa hẳn, không giữ lại dưới dạng dead code/backwards-compat shim (theo nguyên tắc dự án: không tạo file "enhanced", sửa trực tiếp).

## Architecture
`customFetch` (Orval fetch mutator) hiện tự đọc `getToken()` rồi gắn `Authorization: Bearer`. Sau khi đổi, bỏ hẳn đoạn đó — thêm `credentials: 'include'` vào `fetch()` để browser gửi cookie theo domain/path đã set ở backend. Response envelope (`{ statusCode, data }`) không đổi — phase này không đụng gì đến cách đọc `res.data.data` hiện có trong `use-auth-actions.ts`, chỉ bỏ dòng `setToken(...)`.

**[Red Team] Auto-refresh-on-401 flow:**
```
customFetch nhận response 401 (không phải lỗi network, đúng là 401 Unauthorized)
  → nếu URL request KHÔNG phải chính /auth/refresh (tránh vòng lặp vô hạn)
  → gọi POST /auth/refresh (credentials: 'include', không cần body — cookie tự gửi kèm)
    → nếu refresh 200: replay lại request gốc y hệt (cùng url/method/body/headers), trả kết quả replay
    → nếu refresh cũng 401/lỗi: throw ApiError(401) như cũ, để nơi gọi tự xử lý (thường redirect /login)
```

Đây là 1 lần retry duy nhất (không retry vô hạn) — nếu request replay sau refresh vẫn 401 (trường hợp hiếm, ví dụ user bị revoke session ngay giữa lúc refresh), không retry thêm lần 2, trả lỗi luôn.

## Related Code Files
- Delete: `apps/web/lib/auth/auth-token.ts`
- Modify: `apps/web/lib/api/http-client.ts` — bỏ `getToken()`/`Authorization` header, thêm `credentials: 'include'`, **[Red Team] thêm logic auto-refresh-on-401**
- Modify: `apps/web/features/auth/hooks/use-auth-actions.ts` — bỏ import + gọi `setToken()`
- Modify: `apps/web/lib/api/generated/model/authResultDto.ts` — regenerate qua `pnpm codegen` sau phase 2 (không sửa tay — file generated), verify field `accessToken` đã biến mất khỏi type
- Check (không chắc cần sửa, verify khi thực thi): `apps/web/features/auth/hooks/use-auth-actions.ts` phần logout — README hiện tại chưa có nút logout thật (chỉ có `login`), nếu phase này phát hiện có logout UI thì thêm `useAuthLogout()` hook gọi endpoint `/auth/logout` mới từ phase 2

## Implementation Steps
1. Chạy `pnpm codegen` (nếu chưa chạy từ cuối phase 2, với `docker compose up -d` + `.env` đủ biến JWT mới — xem lưu ý Phase 2) để `apps/web/lib/api/generated/` phản ánh đúng response shape mới (không còn `accessToken`).
2. Sửa `apps/web/lib/api/http-client.ts`:
   - Xóa `import { getToken } from '@/lib/auth/auth-token'`.
   - Xóa biến `token` và object `Authorization` header trong `fetch(...)`.
   - Thêm `credentials: 'include'` vào object thứ 2 truyền cho `fetch()`.
   - **[Red Team]** Thêm logic: nếu `response.status === 401` VÀ `url` hiện tại không phải endpoint refresh chính nó (so sánh path, ví dụ không kết thúc bằng `/auth/refresh`) → gọi `fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })`. Nếu refresh trả 200 → gọi lại `fetch` gốc với cùng `url`/`init` (đệ quy 1 lần, không lặp thêm) → trả kết quả đó. Nếu refresh thất bại → giữ nguyên hành vi cũ (`throw new ApiError(401, ...)`).
   - Giữ nguyên toàn bộ phần còn lại (xử lý lỗi, unwrap envelope) — không đổi hành vi đó.
3. Sửa `apps/web/features/auth/hooks/use-auth-actions.ts`:
   - Xóa `import { setToken } from '@/lib/auth/auth-token'`.
   - Xóa dòng `setToken(res.data.data.accessToken)` trong `login()` — cookie đã được backend set tự động qua response header `Set-Cookie`, FE không cần làm gì thêm.
   - Giữ nguyên `queryClient.invalidateQueries()`, toast, `router.push('/')`.
4. Xóa file `apps/web/lib/auth/auth-token.ts`.
5. Grep lại toàn bộ `apps/web` cho `auth-token` và `localStorage` liên quan auth để đảm bảo không còn tham chiếu chết (import lỗi biên dịch nếu sót).
6. Nếu cần logout UI (kiểm tra: README hiện chỉ có `/login`, chưa có dashboard nào để đặt nút logout) — nếu chưa có chỗ đặt UI logout thật, bỏ qua bước này, chỉ đảm bảo endpoint `/auth/logout` từ phase 2 sẵn sàng dùng khi dự án con thêm dashboard.

## Success Criteria
- [x] `apps/web/lib/auth/auth-token.ts` không còn tồn tại
- [x] Không còn kết quả nào khi grep `localStorage` trong `apps/web`
- [x] `pnpm --filter=web check-types` pass
- [x] `pnpm --filter=web build` pass
- [x] Test qua browser thật (agent-browser): login tại `/login` → cookie tự động (không lộ trong JSON) → redirect `/` → `/auth/me` tự động kèm cookie mà không cần code FE làm gì
- [x] **[Red Team] Test qua browser thật (`JWT_ACCESS_TTL=5s`)**: request gốc 401 → `POST /auth/refresh` tự động → replay request gốc thành công (200) — verify qua `agent-browser eval` mô phỏng đúng logic `customFetch`, network log xác nhận đúng trình tự 3 request
- [x] **[Red Team] Test refresh cũng thất bại**: logout trước (revoke session) → request cần auth → 401 → refresh cũng 401 → không lặp vô hạn, đúng 1 lần retry — verify qua browser thật

## Risk Assessment
- **CORS + credentials**: `fetch` với `credentials: 'include'` cross-origin (FE port 3000, BE port 3001) yêu cầu backend `Access-Control-Allow-Origin` là domain cụ thể (không phải `*`) VÀ `Access-Control-Allow-Credentials: true` — đã có `enableCors({ credentials: true })` ở `main.ts` từ trước (verify lại `origin` field không bị bỏ sót khi test cross-port). Nếu thiếu, cookie sẽ không được set/gửi và mọi request sẽ 401 âm thầm — đây là lỗi phổ biến nhất khi đổi sang cookie auth, dành thời gian test kỹ trên browser thật.
- **[Red Team] Vòng lặp refresh vô hạn**: nếu logic auto-refresh không loại trừ chính request `/auth/refresh` ra khỏi phạm vi retry, 1 request refresh thất bại (401) sẽ tự gọi refresh lần nữa, vô hạn. Bắt buộc check path trước khi trigger refresh — xem Implementation Steps bước 2.
- **[Red Team] Refresh đồng thời từ nhiều request song song**: nếu trang có nhiều query 401 cùng lúc (ví dụ do `queryClient.invalidateQueries()` không tham số ở `use-auth-actions.ts:20` invalidate mọi query), mỗi request có thể tự trigger `/auth/refresh` riêng — nhiều lần gọi refresh cùng lúc chính là race condition mà Phase 2 đã thêm compare-and-swap để xử lý ở phía backend (không revoke oan), nhưng phía FE vẫn nên cân nhắc dedupe (chỉ 1 refresh call tại 1 thời điểm, các request khác đợi kết quả refresh đó) nếu muốn tối ưu — không bắt buộc cho phase này vì backend đã chịu được race, nhưng ghi nhận đây là cơ hội tối ưu sau nếu thấy nhiều refresh call trùng lặp trong Network tab lúc test.
- Next.js SSR/RSC: nếu sau này có Server Component cần đọc cookie để biết trạng thái đăng nhập (hiện chưa có, chỉ Client Component), sẽ cần cách đọc khác (`next/headers` cookies()) — ngoài phạm vi phase này vì chưa có use case, ghi chú lại cho dự án con biết khi cần.
