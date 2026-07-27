## Docker

- `docker-compose.yml` KHÔNG hardcode `container_name` — để Compose tự đặt tên theo tên thư mục dự án. Hai clone của base này chạy `docker compose up -d` cùng lúc trên cùng máy sẽ đụng tên container nếu hardcode.
- `apps/api/Dockerfile` và `apps/web/Dockerfile` là multi-stage build (pnpm workspace-aware, non-root user), viết sẵn để `docker build` chạy được — nhưng **không** wire vào bất kỳ deploy platform nào (Dokploy, Vercel, K8s, VPS...). Chọn và cấu hình nền tảng deploy là việc của dự án cụ thể khi biết rõ nền tảng, không phải việc của base template — quyết định này đã brainstorm rõ, đừng tự thêm CI/CD hay compose.prod vào base nữa trừ khi pattern deploy thật sự cố định qua nhiều dự án.
- `apps/web/next.config.ts` có `output: 'standalone'` (bắt buộc cho Dockerfile FE). Trên Windows, bước "collecting build traces" của `next build` cần tạo symlink — Windows chặn việc này mặc định ngoài quyền Administrator/Developer Mode. Nếu `pnpm build` báo `EPERM: operation not permitted, symlink...`, bật Windows Developer Mode (Settings → Privacy & Security → For Developers), không phải lỗi code.

## Git & .gitignore

- `docs/` bị gitignore hoàn toàn (journal là nhật ký làm việc cục bộ, không phải tài liệu sản phẩm). `plans/` KHÔNG bị gitignore — nhưng plan đã hoàn thành nên được dọn định kỳ (xem "Vòng đời plans/ và docs/journals/" bên dưới).
- Không dùng `*.env.example` (glob re-ignore) nếu đã có `!/.env.example` negation phía trên — thứ tự rule trong `.gitignore` quan trọng, 1 rule "re-ignore" đứng sau có thể âm thầm ghi đè negation đứng trước, khiến file template không bao giờ được track dù `git add` không báo lỗi gì. Luôn `git check-ignore -v <file>` để xác nhận sau khi sửa `.gitignore`.

## Vòng đời `plans/` và `docs/journals/`

Đây là nhật ký **xây dựng base template**, không phải tài liệu **của** base template khi nó bị clone đi. Sau khi 1 mốc lớn hoàn tất và các quyết định quan trọng đã được cô đọng vào `.agent/projectRules/*.md`, thư mục `plans/` và `docs/journals/` liên quan có thể xoá — người clone base sau này cần đọc "base này hoạt động ra sao và tại sao", không cần đọc lại hành trình A→B→C đã dẫn tới đó.

Quy tắc: **trước khi xoá bất kỳ plan/journal nào, luôn trích xuất quyết định/gotcha quan trọng vào `backend-architecture.md`/`frontend-architecture.md`/file này trước.** Không xoá rồi mới nhớ ra có gì đó quan trọng bị mất.

## Tooling baseline

- Prettier: `.prettierrc.json` + `.prettierignore` ở root — không dùng default prettier không cấu hình, để `pnpm format` nhất quán và không format nhầm file generated (Orval, Prisma).
- `turbo.json`: task `lint`/`check-types`/`test` phải `dependsOn: ["^lint"]`/`["^check-types"]`/`["^test"]` tương ứng (không phải `["^build"]`) — dù `packages/eslint-config`/`typescript-config` hiện chưa có script `lint`/`test` nên turbo âm thầm no-op, đây là "đúng nhưng tình cờ đúng" nếu để `^build`; đổi đúng key thể hiện đúng ý định, không chỉ tình cờ chạy được.
- `packages/eslint-config/{nest,next}.js` là passthrough có chủ đích (chưa có rule riêng framework) — không phải thiếu sót. Mở rộng khi `apps/api`/`apps/web` lớn hơn phạm vi stub hiện tại.

## Rate limiting & security headers là baseline, không phải optional

Base template ship sẵn `@nestjs/throttler` (100 req/min/IP mặc định, chỉnh theo route khi có domain thật) và `helmet` (CSP tắt nếu app có Swagger UI) ngay từ đầu — không đợi tới khi có domain module thật mới thêm. Xem chi tiết kỹ thuật ở `backend-architecture.md`.
