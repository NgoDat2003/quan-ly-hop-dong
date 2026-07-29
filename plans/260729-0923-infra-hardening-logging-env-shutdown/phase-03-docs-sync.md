---
phase: 3
title: Docs sync
status: completed
priority: P2
effort: 20m
dependencies:
  - 1
  - 2
---

# Phase 3: Docs sync

## Overview

Ghi lại quyết định + lý do (bufferLogs, redact, vị trí `.env.example`, graceful shutdown) vào `.agent/projectRules/backend-architecture.md` và `.agent/projectRules/base-template-conventions.md`, theo đúng vòng đời tài liệu đã mô tả trong `documentation-management.md` — để gotcha không bị mất khi có thay đổi sau này, giống cách các quyết định khác (Prisma adapter, `dotenv/config` order...) đã được ghi lại trong 2 file này.

## Key Insights

- `documentation-management.md` (global rule) yêu cầu cập nhật docs sau khi implement feature/fix. Đây không phải optional cleanup mà là bước bắt buộc của workflow.
- `backend-architecture.md` mục "Bootstrap Baseline" đã có sẵn cấu trúc bullet-point kiểu "X phải giữ nguyên, lý do Y" — logging/shutdown nên nối tiếp đúng format này, không tạo section mới rời rạc.
- `base-template-conventions.md` mục "Git & .gitignore" đã ghi độ nhạy cảm của `.env.example`/`.gitignore` — nên bổ sung ghi chú vị trí đúng của `.env.example` (root, không phải `apps/api/`) vào đây để tránh lặp lại nhầm lẫn.
- Theo `review-audit-self-decision.md` rule #5 (đã áp dụng xuyên suốt plan này): không được nhét phase number/finding code vào code comment hay doc — chỉ giải thích invariant/lý do, không tham chiếu "Phase 2 của plan XYZ".

## Requirements

- Functional: Không có.
- Non-functional: Mọi doc update phải mô tả **lý do** (why), không chỉ liệt kê "what changed" — khớp tinh thần các đoạn hiện có trong 2 file này.

## Architecture

Không đổi code — chỉ đọc-sửa 2 file markdown.

## Related Code Files

- Modify: `.agent/projectRules/backend-architecture.md`
- Modify: `.agent/projectRules/base-template-conventions.md`

## Implementation Steps

1. Đọc lại `.agent/projectRules/backend-architecture.md` mục "Bootstrap Baseline (đã có sẵn, đừng xoá khi refactor)" — xác nhận format bullet hiện có (mỗi bullet: 1 câu bold mô tả rule, sau đó giải thích lý do/hậu quả nếu bỏ qua).
2. Thêm 2 bullet mới vào đúng mục đó:
   - Về `app.enableShutdownHooks()`: giải thích nếu thiếu, `PrismaService.onModuleDestroy` không bao giờ được gọi khi container nhận `SIGTERM`, kết nối DB bị cắt đột ngột thay vì đóng gọn gàng.
   - Về `LoggerModule`/`bufferLogs`/`redact`: giải thích lý do `redact: ['req.headers.authorization']` bắt buộc (rò rỉ JWT token vào log nếu thiếu), và lý do `bufferLogs: true` + `useLogger()` đặt sớm trong `main.ts` (log bootstrap không bị mất/lẫn 2 format).
3. Thêm 1 dòng vào `.agent/projectRules/base-template-conventions.md` mục "Git & .gitignore" (hoặc tạo mục nhỏ "Env files" nếu mục hiện tại không phù hợp về chủ đề): `.env.example` nằm ở **root**, không phải `apps/{app}/` — vì README hướng dẫn `cp .env.example apps/api/.env` từ root.
4. Đọc lại toàn bộ 2 file sau khi sửa để đảm bảo không trùng lặp nội dung, không mâu thuẫn với đoạn nào đã có (vd không lặp lại giải thích Prisma adapter đã có sẵn).

## Success Criteria

- [ ] `backend-architecture.md` mục Bootstrap Baseline có bullet mới cho `enableShutdownHooks()` và `LoggerModule`/pino, đúng format bullet hiện có.
- [ ] `base-template-conventions.md` ghi rõ vị trí đúng của `.env.example`.
- [ ] Không có tham chiếu tới số phase/tên plan trong nội dung doc (theo rule cấm nhét plan taxonomy vào artifact lâu dài).
- [ ] Đọc lại toàn bộ 2 file, xác nhận không mâu thuẫn nội dung cũ.

## Risk Assessment

Rủi ro thấp nhất trong 3 phase — chỉ là doc, không ảnh hưởng runtime. Rủi ro duy nhất: quên cập nhật khiến quyết định "tại sao redact bắt buộc" bị mất, người sau xoá nhầm dòng `redact` khi refactor logging.
