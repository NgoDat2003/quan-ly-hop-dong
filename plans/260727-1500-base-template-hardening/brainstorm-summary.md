# Brainstorm Summary: Base Template Hardening

**Date:** 2026-07-27
**Context:** Sau khi hoàn thành plan `260726-2200-lms-training-app-mvp` (5 phase scaffold), user thêm workspace project `maycha_QAQC_app` (mature reference monorepo, cùng stack Turborepo/pnpm) để so sánh và tìm cải tiến hợp lý cho base template `training-app`. `training-app` là base để clone làm mọi project sau này — không phải tên dự án thật.

## Problem statement

Base template hiện tại (5 phase đã xong) đúng theo plan gốc nhưng còn vài khoảng trống hạ tầng "cần thiết và hợp lý" (lời user) cho một base sẽ bị clone nhiều lần — không phải tính năng nghiệp vụ, mà là quality-of-life cho template.

## Requirements (đã chốt qua AskUserQuestion)

- **Đầu ra mong đợi:** sửa/thêm code cụ thể trong `apps/api` — không đổi kiến trúc lớn (không thêm storage/S3, không thêm auth-sessions tách khỏi User)
- **Tiêu chí chấp nhận:** mỗi hạng mục phải build/lint/test pass, không phá vỡ 5 phase đã có
- **Phạm vi loại trừ:** storage module (MinIO/S3), auth-sessions module riêng, mọi domain nghiệp vụ QAQC (audit/training/criteria/brands/stores) — quyết định kiến trúc lớn hơn, để sau
- **Ràng buộc:** giữ format lỗi hiện có `{statusCode, message, error}` (không đổi sang `{statusCode, code, message}` của B để không phá Orval types); không copy nguyên schema env của B (Mongo/MinIO) — chỉ validate 4 biến A thực sự dùng
- **Điểm chạm:** `apps/api/src/common/filters/http-exception.filter.ts`, `apps/api/src/app.module.ts`, `apps/api/src/config/` (mới), `apps/api/src/modules/health/` (mới), `apps/api/src/app.controller.ts` (xoá health endpoint cũ), `turbo.json`, `packages/eslint-config/{next,nest}.js`, `docker-compose.yml`

## Nguồn tham khảo: maycha_QAQC_app (Mongoose/MongoDB + Ant Design, KHÁC stack persistence/UI với A)

Quan trọng: B dùng Mongoose không phải Prisma, Ant Design không phải shadcn — nên KHÔNG copy được phần Prisma driver-adapter hay Orval mutator (A đã tự giải quyết, đi trước B ở 2 điểm này vì B còn ở Orval 7/chưa gặp vấn đề). Chỉ học được các **pattern hạ tầng framework-agnostic**.

## Đánh giá 5 nhóm hạ tầng của B — quyết định include/exclude

| Nhóm                                        | Include?              | Lý do                                                                                                                    |
| ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ExceptionFilter bắt tất cả lỗi (`@Catch()`) | ✅ Include            | Rẻ, an toàn, filter hiện tại của A chỉ bắt `HttpException`, lỗi Prisma thật (sau khi hết stub) sẽ lọt qua lộ stack trace |
| Env validation (zod, fail-fast)             | ✅ Include            | Rẻ, giá trị cao — tránh lỗi mơ hồ khi thiếu `.env`. Chỉ validate biến A thật dùng, không copy schema Mongo/MinIO của B   |
| Health module (Terminus)                    | ✅ Include (tối giản) | Chỉ check Postgres qua `PrismaService`, bỏ MinIO/storage indicator vì A chưa có storage                                  |
| Storage module (S3/MinIO)                   | ❌ Exclude            | Cần quyết định kiến trúc lớn (thêm Docker service, object storage provider) — không phải "free win"                      |
| Auth-sessions module riêng                  | ❌ Exclude            | Đổi data model (tách session khỏi User) — quyết định lớn, để sau                                                         |

## Bổ sung: xác nhận cấu trúc thư mục BE

User hỏi riêng về việc setup sẵn folder kiến trúc cho BE. Sau khi so sánh cấu trúc `modules/{name}/` của B (module trưởng thành có `dto/`, `schema/`, `services/`, `constants/`) với A hiện tại:

**Kết luận: A's cấu trúc hiện tại đã đúng chuẩn tối giản** (`access-control/{decorators,guards,strategies}`, `auth/dto`, `users/dto`) — khớp đúng tinh thần YAGNI đã ghi trong `apps/api/src/modules/README.md` (chỉ tách `services/` khi >500 dòng/>6 dependency, không pre-split). Quyết định: **không tạo folder rỗng mới** (`services/`, `constants/`, `schema/`) trong `modules/users/` vì UsersService hiện chỉ có 3 method stub, chưa đủ lớn để tách. Không có gì cần làm thêm ở mục này — `modules/README.md` đã mô tả đủ khung bằng văn bản.

## Gộp thêm 3 hạng mục từ code-review trước đó (cùng phiên làm việc)

1. **`turbo.json`**: `lint`/`check-types`/`test` đổi `dependsOn: ["^build"]` → `["^lint"]`/`["^check-types"]`/`["^test"]` tương ứng — hiện tại "chạy đúng nhưng tình cờ đúng" vì `packages/eslint-config`/`typescript-config` không có script `build`, turbo âm thầm bỏ qua. B (mature) đã dùng đúng pattern chuẩn này.
2. **`packages/eslint-config/{next,nest}.js`**: hiện là passthrough rỗng (`export const X = [...base]`). Thêm comment TODO giải thích đây là chỗ dừng có chủ đích, và note trigger để mở rộng (ví dụ wire `eslint-config-next` đã cài nhưng chưa dùng).
3. **`docker-compose.yml`**: bỏ `container_name: training-app-postgres` hardcode (tránh đụng tên container nếu 2 project clone từ base này chạy `docker compose up` cùng lúc trên 1 máy).

## Final decision — 7 hạng mục, KHÔNG cần task riêng cho "folder structure" (đã xác nhận đúng)

1. `HttpExceptionFilter` → `@Catch()` bắt hết lỗi
2. Env validation zod (4 biến thật: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `WEB_ORIGIN`)
3. Health module Terminus (chỉ Postgres indicator, xoá `AppController.health()` cũ)
4. `turbo.json` task graph fix (`^build` → `^lint`/`^check-types`/`^test`)
5. `eslint-config` next.js/nest.js — thêm TODO comment giải thích passthrough có chủ đích
6. `docker-compose.yml` bỏ hardcode container_name
7. (Không có việc phải làm — xác nhận structure hiện tại đã đúng, ghi vào changelog/plan cho rõ ràng)

## Risk & mitigation

- Xoá `AppController.health()` cũ sẽ đổi route response shape (health module Terminus trả JSON khác `{status:'ok'}` cũ) — cần cập nhật README's boot-verification step 3 tương ứng
- Env validation phải test kỹ trường hợp thiếu `.env` (README đã ghi "boots with no .env file present" là success criterion của Phase 2 — validate phải cho phép default rỗng hợp lệ, không được phá vỡ tiêu chí đó)
- Đổi `turbo.json` dependsOn cần re-verify `pnpm build && pnpm lint && pnpm check-types` toàn bộ workspace vẫn pass

## Next steps

Chuyển sang `/ck:plan` để lên kế hoạch triển khai chi tiết 6 hạng mục thực thi (mục 7 chỉ là ghi nhận, không cần phase riêng).
