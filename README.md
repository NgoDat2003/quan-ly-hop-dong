# Training App — Base Skeleton

> **⚠️ Đây là bộ khung cấu trúc (structural skeleton). Không deploy cái này ở bất cứ đâu.**
> Auth (JWT guard, permission check, password hashing) đã implement thật — không còn là stub. Vẫn chưa có domain module nào ngoài `User`, chưa có dashboard/trang đăng ký, seed data dùng credential dev-only.

## Base này chứa gì

- Monorepo (Turborepo + pnpm) gồm `apps/api` (NestJS + Prisma + PostgreSQL) và `apps/web` (Next.js App Router + shadcn/ui).
- Một bảng domain duy nhất: `User` (+ enum `Role`). **Không có module domain nào khác.** Thêm module đầu tiên là việc của người đọc — xem [`apps/api/src/modules/README.md`](./apps/api/src/modules/README.md).
- Lớp JWT/access-control đã implement thật: guard kiểm tra token + permission thật qua DB, `JwtStrategy` tra user tươi mỗi request.
- Pipeline contract dạng envelope: backend DTO → OpenAPI → Orval → typed frontend hooks.
- Một màn hình duy nhất: `/login`. Không có dashboard, không có trang đăng ký, không có route nào khác — sau khi login thành công, redirect về `/` (hiện chỉ là placeholder).

## Yêu cầu trước khi chạy

- Node >= 18
- pnpm
- **Docker** (để chạy Postgres local)

## Setup

```bash
pnpm install
cp .env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
docker compose up -d
pnpm --filter=api prisma:migrate
pnpm --filter=api seed
pnpm codegen
pnpm dev
```

`pnpm --filter=api seed` tạo 1 admin user đầu tiên (`admin@example.com` / `admin12345`, password đã hash) — cần chạy trước khi login lần đầu, vì không có endpoint đăng ký công khai. Seed từ chối chạy nếu `NODE_ENV=production` — chỉ dùng cho dev/skeleton, không dùng credential này trên môi trường thật.

- API: `http://localhost:3001` — Swagger UI tại `http://localhost:3001/api`
- Web: `http://localhost:3000` — màn hình duy nhất là `http://localhost:3000/login`

## Những gì vẫn còn là stub

| Phần | Hành vi hiện tại |
| --- | --- |
| `UsersService.create` | Throw `not implemented` — không có endpoint đăng ký công khai, người dùng đầu tiên tạo qua seed script |

Toàn bộ phần auth (`JwtAuthGuard`, `PermissionsGuard`, `JwtStrategy.validate()`, `hasPermission()`, `AuthService.login`/`refresh`/`logout`/`me`, `AuthSessionsService`, `useAuthActions().login`) đã implement thật, có test boundary chứng minh guard thực sự chặn request sai (xem `apps/api/src/modules/access-control/access-control.integration.spec.ts`) và chứng minh rotate/revoke hoạt động thật ở tầng SQL, không chỉ ở tầng mock (xem `apps/api/src/modules/auth-sessions/auth-sessions.service.integration.spec.ts`).

`AuthSessionsService.revokeAllUserSessions` hiện chỉ có 1 call site thật: nhánh phát hiện refresh token bị tái sử dụng (replay) trong `AuthService.refresh()`. **Chưa có endpoint đổi mật khẩu** — nếu dự án con thêm change-password, đó là nơi tự nhiên thứ 2 để gọi hàm này (đổi mật khẩu nên đá mọi thiết bị khác ra), nhưng tính năng đó chưa tồn tại trong base.

### Bài học lịch sử: vì sao "không báo lỗi rõ ràng" từng là bẫy nguy hiểm nhất ở đây

Đoạn này mô tả trạng thái BAN ĐẦU của base template (trước khi auth được implement thật) — giữ lại vì giá trị giáo dục, KHÔNG phải cảnh báo còn hiệu lực cho code hiện tại.

Mọi stub cũ từng **chạy thành công** mà không báo lỗi gì. `JwtAuthGuard.canActivate` từng trả `true` không throw, không log cảnh báo, không trả 403 — cho mọi request đi qua bất kể có auth hay không. Một route guard bằng `@RequirePermissions('order:delete')`, test bằng Postman và thấy `200` — cái `200` đó không chứng minh được gì, vì guard trả đúng `200` y hệt cho request không hề có token.

Bẫy sâu hơn 1 lớp: `JwtStrategy.validate()` từng hardcode `role: 'ADMIN'` cho **bất kỳ** JWT hợp lệ nào, bất kể token đó của ai hay user đó có tồn tại hay không. Một route "đúng chuẩn" từ chối request chưa đăng nhập vẫn có thể âm thầm cấp quyền admin cho mọi user đã đăng nhập.

Đây là cùng 1 loại lỗi với sự cố `process.env.DATABASE_URL` mà chính base template này từng gặp phải trong lúc xây dựng (xem lịch sử git / commit message) — code chạy được và trả lời thành công không phải là bằng chứng nó làm đúng việc. Bài học này là lý do `access-control.integration.spec.ts` tồn tại: test boundary thật (không token → 401, sai permission → 403, user không tồn tại trong DB → 401) là cách kiểm tra thật duy nhất, không phải "endpoint có phản hồi không".

## Lưu ý bảo mật: cookie-based auth + CSRF

Access token (15 phút) và refresh token (7 ngày) lưu ở httpOnly cookie (`app_access_token` path `/`, `app_refresh_token` path `/auth`) — không phải `localStorage`/`Authorization: Bearer` như bản trước. `AuthSession` (Postgres) lưu hash của mỗi refresh token, cho phép revoke thật: `POST /auth/logout` revoke đúng session; nếu `POST /auth/refresh` phát hiện 1 refresh token cũ (đã rotate) bị dùng lại — dấu hiệu token đã bị đánh cắp — **toàn bộ session của user đó** bị revoke ngay (`AuthSessionsService.revokeAllUserSessions`), không chỉ session bị nghi ngờ.

**Đánh đổi bảo mật:** chuyển từ Bearer header sang cookie xóa bỏ miễn nhiễm CSRF mặc định mà thiết kế cũ có (browser không tự đính kèm header, nhưng tự đính kèm cookie vào mọi request cùng origin). Base template bù lại bằng 2 lớp phòng thủ:
1. `SameSite=Lax` (access cookie) / `SameSite=Strict` (refresh cookie) — chặn phần lớn CSRF cho deploy cùng site (subdomain hoặc cùng domain).
2. `OriginCheckGuard` (global) — chặn mọi request state-changing (POST/PUT/PATCH/DELETE) có header `Origin` khác `WEB_ORIGIN`.

**Nếu dự án con deploy FE/BE ở 2 domain hoàn toàn khác nhau** (không phải subdomain), cookie cần `SameSite=None`, lúc đó 2 lớp phòng thủ trên là **chưa đủ** — bắt buộc tự thêm CSRF token đầy đủ (double-submit cookie hoặc tương đương). Base template mặc định chỉ hỗ trợ same-site deploy.

## Quyết định kiến trúc quan trọng nhất cần giữ lại

Mọi response thành công đều được bọc envelope `{ statusCode, data }` bởi `TransformInterceptor`, và được document qua các class DTO envelope cụ thể cho từng endpoint kế thừa `ApiResponseDto` (không dùng pattern `allOf` chung — xem `apps/api/src/modules/README.md` để biết lý do, và khi nào nên chuyển sang pattern đó). Fetch mutator ở frontend (`apps/web/lib/api/http-client.ts`) **không** tự bóc lớp envelope này.

Một điểm cần lưu ý riêng với phiên bản Orval của base này: các hook react-query được generate ra bọc thêm 1 lớp `{ data, status, headers }` bên ngoài lớp envelope kia, nên tại nơi gọi phải đọc `res.data.data` — `data` bên ngoài là wrapper của Orval's fetch-client, `data` bên trong mới là envelope thật của API. Điều này đã được ghi chú inline trong `use-auth-actions.ts`.

## Hai quy tắc cho mọi thay đổi sau này

1. **Không bao giờ sửa tay `apps/web/lib/api/generated/`.** Đổi DTO/Swagger ở backend, sau đó chạy `pnpm codegen` từ gốc repo.
2. **Thêm module backend mới** theo đúng [`apps/api/src/modules/README.md`](./apps/api/src/modules/README.md) — không có sẵn module mẫu để copy, chỉ có 2 module `auth`/`users` đang sống và tài liệu đó.

## Docker images

`apps/api/Dockerfile` và `apps/web/Dockerfile` là multi-stage build (pnpm workspace-aware, chạy bằng user non-root) đã sẵn sàng tạo ra image chạy được cho từng app:

```bash
docker build -f apps/api/Dockerfile -t create-project-from-template-api .
docker build -f apps/web/Dockerfile -t create-project-from-template-web --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 .
```

`apps/api/Dockerfile` đã được verify chạy thật (`docker build` + `docker run` + login qua container thành công) khi thêm argon2 — cần Node 22 (không phải 20) để khớp `pnpm@11.2.2`, và cần build-toolchain (`python3 make g++`) trong 2 stage cần compile native addon (`argon2`), cả 2 điểm này đã sửa trong Dockerfile. `apps/web/Dockerfile` **chưa** được chạy thử `docker build`/`docker run` trên máy thật — verify trước khi dựa vào cho việc gì thật sự quan trọng. Cả 2 chủ đích chỉ dừng lại ở mức "tạo ra được image chạy được". Không cái nào được nối vào 1 nền tảng deploy cụ thể (Dokploy, Vercel, K8s, VPS thuần, hay gì cũng được) — chọn và cấu hình nền tảng đó là việc của dự án cụ thể khi nó biết rõ target thật, không phải việc của base này. `docker-compose.yaml` ở đây chỉ dùng cho local dev (chỉ có Postgres); không có `docker-compose.prod.yaml`, không có CI/CD.

**Lưu ý cho Windows:** `output: 'standalone'` của `apps/web` cần tạo symlink trong bước thu thập trace của `next build`. Windows mặc định chặn việc này ngoài quyền Administrator hoặc Developer Mode (Settings → Privacy & Security → For Developers) — bật Developer Mode nếu `pnpm build` báo lỗi `EPERM: operation not permitted, symlink...`.

## Các lệnh thường dùng

```bash
pnpm dev            # cả 2 app, chế độ watch
pnpm build          # cả 2 app
pnpm lint            # cả 2 app
pnpm check-types    # cả 2 app
pnpm test           # cả 2 app — apps/api có test hành vi thật cho auth boundary (guard, permission check)
pnpm codegen        # export OpenAPI từ api -> orval -> sinh typed client cho web
```
