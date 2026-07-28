# Training App — Base Skeleton

> **⚠️ Đây là bộ khung cấu trúc (structural skeleton). Không deploy cái này ở bất cứ đâu.**
> Mọi service method, cả 2 auth guard (`JwtAuthGuard`, `PermissionsGuard`), `JwtStrategy.validate()`, và frontend action hook (`useAuthActions().login`) đều là stub. API **không có auth thật và không có authorization thật** — cả 2 guard hiện tại đều `return true` vô điều kiện.

## Base này chứa gì

- Monorepo (Turborepo + pnpm) gồm `apps/api` (NestJS + Prisma + PostgreSQL) và `apps/web` (Next.js App Router + shadcn/ui).
- Một bảng domain duy nhất: `User` (+ enum `Role`). **Không có module domain nào khác.** Thêm module đầu tiên là việc của người đọc — xem [`apps/api/src/modules/README.md`](./apps/api/src/modules/README.md).
- Lớp JWT/access-control dạng stub: guard, decorator, và `JwtStrategy` đã wiring nhưng không làm gì (no-op).
- Pipeline contract dạng envelope: backend DTO → OpenAPI → Orval → typed frontend hooks.
- Một màn hình duy nhất: `/login`. Không có dashboard, không có trang đăng ký, không có route nào khác.

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
pnpm codegen
pnpm dev
```

- API: `http://localhost:3001` — Swagger UI tại `http://localhost:3001/api`
- Web: `http://localhost:3000` — màn hình duy nhất là `http://localhost:3000/login`

## Những gì đang là stub (đọc phần này trước khi báo bug)

| Phần | Hành vi hiện tại |
| --- | --- |
| `UsersService.findById` / `findByEmail` / `create` | Trả `null` / throw `not implemented` |
| `AuthService.login` / `me` | Trả về 1 user stub hardcode + `'stub-token'` |
| `JwtAuthGuard.canActivate` | `return true` — **mọi route đều mở** |
| `PermissionsGuard.canActivate` | `return true` — **không permission nào được kiểm tra** |
| `JwtStrategy.validate()` | Trả về user hardcode, không tra cứu gì cả |
| `hasPermission()` | `return true` vô điều kiện |
| `useAuthActions().login` (frontend) | Gọi thật `POST /auth/login` nhưng bỏ qua kết quả trả về |

**Đăng nhập ở `/login` trông như thành công nhưng không làm gì cả.** Request thật sự chạm tới backend và nhận về 200, nhưng không token nào được lưu, không redirect, không toast nào hiện lên. Đây là trạng thái chủ đích của base này, không phải bug.

### Phần nguy hiểm: không cái nào báo lỗi rõ ràng

Mọi stub ở trên đều **chạy thành công**. `JwtAuthGuard.canActivate` trả `true` không throw, không log cảnh báo, không trả 403 — nó chỉ đơn giản cho mọi request đi qua, có auth hay không cũng vậy. Nếu bạn clone base này, thêm 1 module domain thật, guard 1 route bằng `@RequirePermissions('order:delete')`, test bằng Postman và thấy `200` — cái `200` đó không chứng minh được gì cả. Guard sẽ trả về đúng `200` y hệt cho 1 request không hề có token.

Cái bẫy này còn sâu hơn 1 lớp nữa: khi `JwtAuthGuard` đã được implement thật, `JwtStrategy.validate()` vẫn đang hardcode `role: 'ADMIN'` cho **bất kỳ** JWT hợp lệ nào, bất kể token đó của ai hay user đó có tồn tại hay không. Một route "đúng chuẩn" từ chối request chưa đăng nhập vẫn có thể âm thầm cấp quyền admin cho mọi user đã đăng nhập — và loại lỗi này khó phát hiện hơn nhiều so với cái guard-không-làm-gì ở trên, vì nó trông giống code đang hoạt động với 1 giá trị trả về hợp lý.

**Trước khi coi bất kỳ route có auth-guard nào là xong, bạn phải tự tay sửa lại cả 4 chỗ sau:** `JwtAuthGuard.canActivate`, `PermissionsGuard.canActivate`, `JwtStrategy.validate()`, `hasPermission()`. Grep `TODO: implement` trong `modules/access-control/` và `modules/auth/` nếu không chắc chỗ nào vẫn còn là stub.

Đây là cùng 1 loại lỗi với sự cố `process.env.DATABASE_URL` mà chính base template này từng gặp phải trong lúc xây dựng (xem lịch sử git / commit message) — code chạy được và trả lời thành công không phải là bằng chứng nó làm đúng việc. Một bộ test thật sự kiểm tra ranh giới authorization (chứ không chỉ "endpoint có phản hồi không") là cách kiểm tra thật duy nhất ở đây.

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
pnpm test           # cả 2 app — chỉ 2 spec chứng minh test harness chạy được, không phải test hành vi
pnpm codegen        # export OpenAPI từ api -> orval -> sinh typed client cho web
```
