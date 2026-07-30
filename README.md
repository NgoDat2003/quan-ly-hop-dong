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

Toàn bộ phần auth (`JwtAuthGuard`, `PermissionsGuard`, `JwtStrategy.validate()`, `hasPermission()`, `AuthService.login`/`me`, `useAuthActions().login`) đã implement thật, có test boundary chứng minh guard thực sự chặn request sai (xem `apps/api/src/modules/access-control/access-control.integration.spec.ts`).

### Bài học lịch sử: vì sao "không báo lỗi rõ ràng" từng là bẫy nguy hiểm nhất ở đây

Đoạn này mô tả trạng thái BAN ĐẦU của base template (trước khi auth được implement thật) — giữ lại vì giá trị giáo dục, KHÔNG phải cảnh báo còn hiệu lực cho code hiện tại.

Mọi stub cũ từng **chạy thành công** mà không báo lỗi gì. `JwtAuthGuard.canActivate` từng trả `true` không throw, không log cảnh báo, không trả 403 — cho mọi request đi qua bất kể có auth hay không. Một route guard bằng `@RequirePermissions('order:delete')`, test bằng Postman và thấy `200` — cái `200` đó không chứng minh được gì, vì guard trả đúng `200` y hệt cho request không hề có token.

Bẫy sâu hơn 1 lớp: `JwtStrategy.validate()` từng hardcode `role: 'ADMIN'` cho **bất kỳ** JWT hợp lệ nào, bất kể token đó của ai hay user đó có tồn tại hay không. Một route "đúng chuẩn" từ chối request chưa đăng nhập vẫn có thể âm thầm cấp quyền admin cho mọi user đã đăng nhập.

Đây là cùng 1 loại lỗi với sự cố `process.env.DATABASE_URL` mà chính base template này từng gặp phải trong lúc xây dựng (xem lịch sử git / commit message) — code chạy được và trả lời thành công không phải là bằng chứng nó làm đúng việc. Bài học này là lý do `access-control.integration.spec.ts` tồn tại: test boundary thật (không token → 401, sai permission → 403, user không tồn tại trong DB → 401) là cách kiểm tra thật duy nhất, không phải "endpoint có phản hồi không".

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

`next build` (standalone output) và `nest build` bên dưới đã được verify chạy thành công — nhưng lệnh `docker build`/`docker run` ở trên (build image thật qua Docker daemon) **chưa** được chạy thử trên máy thật. Hãy verify cả 2 trước khi dựa vào chúng cho việc gì thật sự quan trọng. Cả 2 chủ đích chỉ dừng lại ở mức "tạo ra được image chạy được". Không cái nào được nối vào 1 nền tảng deploy cụ thể (Dokploy, Vercel, K8s, VPS thuần, hay gì cũng được) — chọn và cấu hình nền tảng đó là việc của dự án cụ thể khi nó biết rõ target thật, không phải việc của base này. `docker-compose.yaml` ở đây chỉ dùng cho local dev (chỉ có Postgres); không có `docker-compose.prod.yaml`, không có CI/CD.

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
