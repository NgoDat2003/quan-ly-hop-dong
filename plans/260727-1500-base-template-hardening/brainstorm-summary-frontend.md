# Brainstorm Summary: Frontend Clone-Ready Base Template

**Date:** 2026-07-27
**Context:** Song song với `brainstorm-summary.md` (BE hardening cùng phiên). BE đã có "reference module" sống (`auth`+`users`) + `modules/README.md` mô tả shape/steps copy khi thêm module mới. User muốn FE có tương đương — hiện FE `apps/web` chưa clean, chỉ có 1 feature `auth` (toàn stub) và `components/ui/` (chỉ 5 shadcn primitives), không có module CRUD hoàn chỉnh nào để làm mẫu khi clone base sang dự án khác.

## Problem statement

`training-app` là base template dùng để clone sang các dự án khác (không phải tên dự án thật — xem context ở `brainstorm-summary.md`). BE đã "clone-ready" theo nghĩa có 1 module mẫu sống + README. FE thiếu điều tương đương: không có ví dụ sống demo full CRUD pattern (list + detail + create + edit) đã mô tả trong `.agent/projectRules/frontend-architecture.md`, chỉ có tài liệu suông.

## Requirements (đã chốt qua AskUserQuestion)

- **Mục tiêu clone:** clone base repo này cho dự án khác — không phải chỉ tối ưu thêm feature trong chính training-app.
- **Domain mẫu:** đổi tên thành module CRUD trung lập `entities`/`Entity` — không gắn nghĩa nghiệp vụ LMS cụ thể, khớp với ví dụ code sample đã có sẵn trong `apps/api/src/modules/README.md` và `backend-architecture.md` (nhất quán thuật ngữ giữa các doc).
- **Layout:** thêm route group `app/(app)/` với layout tối giản (sidebar + header) làm nơi demo `entities` — chưa cần thiết kế UI hoàn chỉnh, chỉ đủ khung.
- **Shared components:** hiện thực hóa `components/table/` (data-table wrapper + pagination dùng TanStack Table + shadcn) và `components/common/confirm-dialog.tsx` — trước đây mới chỉ là ý tưởng ghi trong `frontend-architecture.md`, module mẫu sẽ dùng thật các component này.
- **Tooling:** KHÔNG viết generator/CLI scaffold — chỉ README + copy tay, nhất quán với cách BE đang làm (YAGNI, tránh chi phí bảo trì script).
- **Phạm vi loại trừ:** domain LMS thật (Course/Lesson), thiết kế UI/UX hoàn chỉnh cho sidebar, mọi generator tooling.
- **Điểm chạm:**
  - BE (bắt buộc đi trước FE, vì FE cần endpoint thật để Orval generate hook thật): Prisma model `Entity`, `apps/api/src/modules/entities/` (module đầy đủ theo shape đã mô tả trong `modules/README.md`)
  - FE: `app/(app)/layout.tsx`, `app/(app)/entities/page.tsx`, `app/(app)/entities/[id]/page.tsx`, `features/entities/{components,hooks}/`, `lib/entities/`, `components/table/{data-table.tsx,data-table-pagination.tsx}`, `components/common/confirm-dialog.tsx`
  - Docs: README mới mô tả feature shape + hướng dẫn đổi tên `Entity` → domain thật khi clone (đối xứng `apps/api/src/modules/README.md`)

## Đã cập nhật trước đó cùng phiên (không cần làm lại)

`.agent/projectRules/frontend-architecture.md` đã được bổ sung (từ nghiên cứu `inno_pos` — Vite/TanStack Router/Zustand SPA, KHÁC stack Next.js/Orval của A nên chỉ học được pattern tổ chức thư mục, không copy code):

- Shared Components Layer: `components/ui|common|table|dialog|search-input/` phân theo mục đích, quy tắc quyết định feature-local vs shared.
- Dialog phức tạp trong feature: co-locate subfolder `features/{feature}/components/dialog/{ten-dialog}/`.
- Store slice pattern chi tiết (`store/slices/{domain}/{domain}-slice.ts,-selectors.ts,-types.ts`) cho Zustand khi vượt 300 dòng.

Việc còn lại (nội dung brainstorm này) là **hiện thực hóa** các ý tưởng đó bằng 1 module sống thật, không chỉ là văn bản.

## Quyết định: tên module mẫu

Cân nhắc `entities`/`Entity` (khớp ví dụ sẵn có trong docs) vs `sample-item`/`SampleItem` (tách bạch rõ đây là demo). Chọn **`entities`/`Entity`** — nhất quán thuật ngữ với tài liệu hiện có, người đọc docs nhận diện ngay đây là "ví dụ chuẩn" đã nhắc tới.

## Kế hoạch triển khai (tóm tắt, chi tiết ở plan)

1. BE: thêm Prisma model `Entity` (id, name, description, createdAt) + `modules/entities/` (controller/service/dto đầy đủ theo README, envelope DTO, operationId domain-prefixed `entity*`) → `prisma:migrate` → `pnpm codegen`.
2. FE shared components: `components/table/data-table.tsx` + `data-table-pagination.tsx` (TanStack Table + shadcn `<Table>`), `components/common/confirm-dialog.tsx`.
3. FE layout: `app/(app)/layout.tsx` (sidebar tối giản + header, 1 link tới `/entities`).
4. FE feature: `features/entities/{components/{entities-list.tsx, entities-columns.ts, entity-form.tsx, entity-detail.tsx}, hooks/use-entities-actions.ts}`, `lib/entities/` nếu cần mapper, `app/(app)/entities/{page.tsx,[id]/page.tsx}`.
5. Docs: README mới (vị trí đề xuất `apps/web/features/README.md`, đối xứng `apps/api/src/modules/README.md`) mô tả feature shape + steps đổi tên khi clone.

## Unresolved questions

- Tên file README FE chính xác — đề xuất `apps/web/features/README.md`, cần xác nhận vị trí khi lập plan chi tiết.
- Permission cho `entity:*` trong `role-permissions.ts` (BE) — cần quyết định set permission mẫu nào lúc viết phase chi tiết.
