# Thêm module backend mới

Base này chỉ ship đúng 2 module — `access-control` và `auth` (cộng thêm `users`, module mà `auth` phụ thuộc vào). Không có module mẫu dựng sẵn để copy; `auth`/`users` là ví dụ sống duy nhất, vì đây là 2 module thật sự boot được.

## Cấu trúc module

```
modules/{name}/
├── {name}.module.ts
├── {name}.controller.ts
├── {name}.service.ts
└── dto/
    ├── {thing}.dto.ts
    └── {thing}-response.dto.ts   (envelope, xem bên dưới)
```

## Các bước để thêm 1 module

1. Thêm model vào `apps/api/prisma/schema.prisma`.
2. `pnpm --filter=api prisma:migrate` (sau đó `pnpm --filter=api prisma:generate` nếu bạn không dùng `migrate dev`).
3. Tạo thư mục module theo cấu trúc ở trên.
4. Đăng ký module trong `src/app.module.ts`.
5. `pnpm codegen` từ gốc repo.
6. Dùng hook đã sinh ở frontend — không bao giờ tự viết tay client.

## Ranh giới Controller / Service

Controller giữ mỏng: route decorator, validate DTO, gọi 1 service duy nhất. Business logic nằm ở service. Chỉ tách service thành `services/{name}-read|-workflow|-shared.service.ts` khi nó vượt 500 dòng hoặc inject 6 dependency — đây là 1 ngưỡng cảnh báo, không phải mặc định. Đừng tách trước 1 module mới toanh cho 1 quy tắc nó chưa hề chạm tới.

**Không bao giờ query bảng của module khác qua `PrismaService` trực tiếp.** Import module đó và inject service đã export của nó thay vì vậy. Đây chính là ranh giới cross-module mà module mẫu ban đầu từng tồn tại để minh hoạ — module mẫu đã bị bỏ, nên quy tắc được ghi lại ở đây thay thế.

## `operationId` và envelope DTO

Mỗi endpoint đều có `operationId` tường minh, đặt tiền tố theo domain (vd: `authLogin`, không phải `login`). Nó sẽ trở thành tên hook ở frontend; nếu trùng tên sẽ âm thầm ghi đè 1 hook khác.

Mỗi response đều có 1 envelope DTO:

```typescript
export class ThingResponseDto extends ApiResponseDto {
  @ApiProperty({ type: ThingDto })
  declare data: ThingDto;
}
```

`TransformInterceptor` bọc mọi response vào `{ statusCode, data }`. Nếu document sai lệch DTO bên trong thì mọi type được sinh ở frontend đều sai. Service chỉ trả về **phần bên trong** — không bao giờ tự bọc trước, nếu không interceptor sẽ bọc chồng 2 lớp.

**Ngưỡng nâng cấp envelope:** nếu các class wrapper cụ thể bắt đầu nhân lên khó chịu (nhiều endpoint, hoặc 1 shape phân trang dùng chung `{ data: T[], meta }`), chuyển sang pattern chung `ApiResponseDto<T>` + `@ApiExtraModels` + `getSchemaPath()` + decorator `allOf`. Pattern đó sinh ra OpenAPI schema inline thay vì entry `components/schemas` có tên riêng, nên phải kiểm tra kỹ tên output của Orval khi chuyển sang.

## Trạng thái auth hiện tại

Auth (guard, `JwtStrategy`, `AuthService`, `AuthSessionsService`, permission check) đã implement thật — không phải stub. Chi tiết cơ chế (access+refresh token qua httpOnly cookie, rotate/revoke) xem [README.md gốc](../../../../README.md) mục "Lưu ý bảo mật: cookie-based auth + CSRF" và [`docs/backend-config-baseline-explained.md`](../../../../docs/backend-config-baseline-explained.md). Không lặp lại nội dung đó ở đây để tránh 2 nguồn sự thật lệch nhau.

Kiểm tra quyền sở hữu (owner-hoặc-ADMIN) thuộc về **service**, sau khi đã load row lên — không đặt trong guard, vì guard không bao giờ thấy được row đó.

## Sau khi đổi 1 DTO hoặc endpoint

Chạy `pnpm codegen`, sau đó dùng hook đã sinh. Không bao giờ tự viết tay client — nếu 1 hook bị thiếu hoặc sai, cách sửa đúng là đổi DTO/decorator ở backend rồi chạy lại, không phải tự vá tay trong `apps/web/lib/api/generated/`.
