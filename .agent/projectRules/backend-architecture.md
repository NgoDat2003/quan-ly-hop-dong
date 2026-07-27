# Backend Architecture: Tách Service Theo Trách Nhiệm

## Nguyên tắc cốt lõi

1. **Controller mỏng.** Controller chỉ định tuyến + decorator (`@Permissions`, `@Public`, validation pipe) — không chứa business logic.
2. **Service facade + application service layer.** Khi 1 module có nhiều luồng nghiệp vụ khác nhau (đọc/liệt kê, quy trình xử lý, logic dùng chung), tách thành sub-service theo trách nhiệm dưới `services/`, orchestrate qua 1 facade mỏng `{name}.service.ts`. Đây là pattern CQRS-inspired application service layer + Facade pattern — không phải tự nghĩ ra, đã dùng nhất quán ở `audit-plans`, `audit-sessions`, `action-plans`.
3. **Ngưỡng tách:** khi service vượt **500 dòng HOẶC inject hơn 6 dependency**, review để tách theo trách nhiệm — không phải một con số cứng, mà là 2 tín hiệu cảnh báo (khác ngưỡng 300 dòng của frontend, vì service backend thường phức tạp hơn component UI).
4. **Không xuyên thủng ranh giới module.** Không dùng `PrismaService` trong service của module khác để query trực tiếp bảng thuộc phạm vi module gốc. Nếu cần dữ liệu từ module khác, inject **Service đã export** của module đó, không tự query bảng qua Prisma.

## Cấu trúc module chuẩn

```
modules/{name}/
├── {name}.module.ts
├── {name}.controller.ts
├── {name}.service.ts              # facade mỏng — orchestrate sub-service, không tự viết logic
├── dto/
│   └── create-{name}.dto.ts       # @nestjs/swagger + class-validator, nguồn sinh OpenAPI cho Orval
└── services/
    ├── {name}-read.service.ts     # Query/liệt kê — không side-effect ghi
    ├── {name}-workflow.service.ts # Quy trình nghiệp vụ nhiều bước (approve, submit, transition)
    └── {name}-shared.service.ts   # LEAF — helper dùng chung trong module, KHÔNG phụ thuộc sub-service khác
```

Model/table định nghĩa tập trung ở `prisma/schema.prisma` (single source of truth toàn app), không có schema file rải rác theo module như Mongoose.

Không phải module nào cũng cần đủ 3 sub-service — chỉ tách khi thực sự có nhiều trách nhiệm khác nhau (theo ngưỡng ở trên). Module đơn giản giữ nguyên 1 file `{name}.service.ts`.

## Ví dụ: trước/sau tách cross-module coupling

**Trước (bẩn — service module này tự query bảng của module khác qua Prisma, xuyên thủng ranh giới):**

```typescript
// modules/dashboard/services/dashboard-report.service.ts
@Injectable()
export class DashboardReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport() {
    // ❌ tự query bảng course/user thuộc module khác trực tiếp qua Prisma
    const courses = await this.prisma.course.findMany({ where: { status: 'active' } });
    const users = await this.prisma.user.findMany({
      where: { id: { in: courses.map((c) => c.creatorId) } },
    });
    // đổi schema Course ở module courses có thể âm thầm vỡ dashboard
  }
}
```

**Sau (sạch — inject Service đã export, tôn trọng ranh giới module):**

```typescript
// modules/dashboard/dashboard.module.ts
@Module({
  imports: [CoursesModule, UsersModule], // import module, dùng service export
})
export class DashboardModule {}
```

```typescript
// modules/dashboard/services/dashboard-report.service.ts
@Injectable()
export class DashboardReportService {
  constructor(
    private readonly coursesService: CoursesService, // ✅ Service export của module khác
    private readonly usersService: UsersService, // ✅ Service export của module khác
  ) {}

  async getReport() {
    const courses = await this.coursesService.findActive();
    const users = await this.usersService.findByIds(courses.map((c) => c.creatorId));
    // module courses đổi implementation nội bộ (kể cả đổi schema Prisma) không ảnh hưởng dashboard
    // miễn interface public của CoursesService không đổi
  }
}
```

Vẫn có coupling (dashboard biết `CoursesService` tồn tại), nhưng qua interface public ổn định thay vì schema nội bộ — đây là phương án mặc định, đơn giản, đủ dùng cho hầu hết trường hợp (YAGNI).

## Khi nào cần hơn Service injection (event-driven / CQRS)

Chỉ nâng cấp lên phức tạp hơn khi có lý do cụ thể, không mặc định:

- **Event-driven (`@nestjs/event-emitter`, `@OnEvent`)**: dùng khi hành động là fire-and-forget, nhiều listener độc lập, không cần đảm bảo đồng bộ (ví dụ: gửi thông báo, ghi audit log). Đã có ví dụ hoạt động tốt ở `modules/notifications/notification-event-handler.service.ts`. Không dùng cho case cần đọc dữ liệu tổng hợp đồng bộ như dashboard.
- **CQRS Query Handlers (`@nestjs/cqrs`)**: chỉ cân nhắc khi cần scale đọc độc lập với ghi, hoặc logic query đủ phức tạp để tách hẳn khỏi service. Đây là bước "enterprise", đa số module không cần tới.

## Auth & Permissions

Guard đăng ký global qua `AccessControlModule` (đánh dấu `@Global()`), không phải trong `main.ts`:

```typescript
// modules/access-control/access-control.module.ts
@Global()
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AccessControlModule {}
```

- `@Public()` — bỏ qua auth cho route công khai (login, health check)
- `@RequirePermissions('resource:action')` — yêu cầu permission cụ thể theo route
- `@CurrentUser()` — lấy user hiện tại từ request đã authenticate

## New Feature Checklist (Backend)

- [ ] Module trong `modules/{name}/`
- [ ] Controller mỏng, business logic nằm ở service
- [ ] Nếu service vượt 500 dòng hoặc >6 dependency — tách `services/{name}-read|workflow|shared.service.ts`
- [ ] DTO trong `modules/{name}/dto/`, có decorator `@nestjs/swagger` đầy đủ (required/optional, enum, nested, response schema) — đây là nguồn Orval sinh client cho frontend
- [ ] `operationId` tường minh cho endpoint quan trọng
- [ ] Không dùng `PrismaService` để query trực tiếp bảng thuộc module khác — inject Service đã export
- [ ] Sau khi đổi DTO/endpoint: chạy `pnpm codegen` để đồng bộ frontend

## Bootstrap Baseline (đã có sẵn, đừng xoá khi refactor)

Những gì `main.ts`/`app.module.ts` đã làm và **lý do bắt buộc phải giữ nguyên**, không phải tuỳ chọn:

- **`import 'dotenv/config'` PHẢI là dòng đầu tiên của `main.ts`.** `ConfigModule.forRoot({isGlobal: true})` chỉ populate `ConfigService`, KHÔNG mutate `process.env` toàn cục cho code đọc trực tiếp (`PrismaService`'s adapter đọc `process.env.DATABASE_URL` trực tiếp). Thiếu dòng này, DB connection string luôn `undefined`, driver `pg` âm thầm fallback về `localhost:5432` mặc định — lỗi chỉ lộ ra khi có 1 Postgres khác vô tình chạy đúng port đó, cực khó debug.
- **Prisma 7 dùng adapter pattern, không dùng `url` trong `schema.prisma` datasource.** Kết nối DB khai báo qua `@prisma/adapter-pg`'s `PrismaPg` trong `PrismaService` constructor, connection string đọc từ `process.env.DATABASE_URL` (không qua `ConfigService`). Nếu thấy code mẫu cũ dùng `url = env("DATABASE_URL")` trong schema — đó là Prisma <7, không áp dụng ở đây.
- **`apps/{app}/tsconfig.json` phải tự khai `outDir` tường minh** (vd: `"outDir": "./dist"`), không dựa vào giá trị kế thừa từ `packages/typescript-config/*.json`. Path tương đối trong 1 config được `extends` resolve theo vị trí của chính file đó, không theo file gọi nó (TypeScript issue #29172) — thiếu dòng này, output build lặng lẽ chui vào `packages/typescript-config/dist/` thay vì `apps/{app}/dist/`.
- **Mọi endpoint hạ tầng (health, metrics...) phải có `@Public()` + `@ApiExcludeEndpoint()`.** Thiếu `@ApiExcludeEndpoint()`, endpoint lọt vào Swagger → Orval tự sinh hook thừa ở frontend cho 1 route không phải domain logic.
- **`HttpExceptionFilter` dùng `@Catch()` (bắt tất cả), không phải `@Catch(HttpException)`.** Lỗi không phải `HttpException` (vd: lỗi Prisma thật khi hết stub) phải trả `500` generic (`{statusCode: 500, message: 'Internal server error', error: 'Internal Server Error'}`), không bao giờ lộ `error.message`/stack trace thật ra response.
- **Rate limiting (`@nestjs/throttler`) và security headers (`helmet`) là baseline mặc định**, không phải tính năng tuỳ chọn thêm sau. `ThrottlerModule` đăng ký `imports` TRƯỚC `AccessControlModule` (giả định throttle rẻ hơn chạy trước JWT/permission check — NestJS KHÔNG document đảm bảo thứ tự `APP_GUARD` giữa các module khác nhau, đây là giả định best-effort, không phải guarantee). Nếu app có Swagger UI, `helmet({ contentSecurityPolicy: false })` — CSP mặc định của helmet chặn inline script/style mà Swagger UI cần.
- **Env validation (`env.schema.ts`, zod) chỉ validate biến app THẬT SỰ đọc**, không copy nguyên schema từ project khác dù project đó "trưởng thành" hơn — biến không dùng chỉ gây confuse. Mọi biến optional phải có default khớp với fallback đã có sẵn trong code, để giữ nguyên khả năng boot khi hoàn toàn không có file `.env`.

## Common Mistakes to Avoid

| Category            | Don't                                                        | Do                                                                                            |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Module boundary** | Dùng `PrismaService` query trực tiếp bảng của module khác    | Inject Service đã export của module đó                                                        |
| **Service size**    | Để service phình to không giới hạn (case thực tế: 3657 dòng) | Tách `-read/-workflow/-shared` khi vượt 500 dòng hoặc >6 dependency                           |
| **Controller**      | Business logic trong controller                              | Đặt trong service                                                                             |
| **Auth**            | `@UseGuards(JwtAuthGuard)` thủ công                          | Auth đã global qua `AccessControlModule`; dùng `@Public()`/`@RequirePermissions()`            |
| **Events**          | Dùng `@OnEvent` cho mọi thứ để "decouple"                    | Chỉ dùng cho fire-and-forget, nhiều listener độc lập; case cần đồng bộ dùng Service injection |
