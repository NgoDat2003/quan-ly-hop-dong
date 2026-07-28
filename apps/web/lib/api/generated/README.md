# API client được sinh tự động

Thư mục này được sinh bởi [Orval](https://orval.dev) từ OpenAPI spec của backend (`apps/api/openapi.json`).

**Không bao giờ sửa tay bất cứ thứ gì trong thư mục này.** Sinh lại bằng `pnpm codegen` từ gốc repo sau khi đổi DTO hoặc endpoint ở backend.

Thư mục này được commit vào git có chủ đích, để một bản clone mới type-check và build được ngay cả khi chưa có database đang chạy.
