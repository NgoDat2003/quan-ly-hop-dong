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
- **`app.enableShutdownHooks()` bắt buộc trong `main.ts`.** Thiếu dòng này, `PrismaService.onModuleDestroy` không bao giờ được Nest gọi khi process nhận `SIGTERM`/`SIGINT` — kết nối DB bị cắt đột ngột thay vì đóng gọn gàng khi container orchestrator dừng app. Đây là loại lỗi không throw, không log cảnh báo, chỉ lộ ra dưới dạng connection pool leak/lỗi lạ khi container restart liên tục.
- **Logging structured qua `nestjs-pino` (`LoggerModule.forRootAsync` trong `AppModule`), không dùng NestJS default `Logger`.** `redact: ['req.headers.authorization']` trong `pinoHttp` config là bắt buộc, không phải optional — thiếu dòng này, JWT Bearer token nằm nguyên văn trong log, rủi ro rò rỉ nếu log được ship sang log aggregator bên thứ 3. `main.ts` phải gọi `NestFactory.create(AppModule, { bufferLogs: true })` rồi `app.useLogger(app.get(Logger))` ngay sau đó — thiếu `bufferLogs: true`, log framework phát ra trong lúc DI container khởi tạo (trước khi `LoggerModule` sẵn sàng) in qua console gốc thay vì pino.
- **`forRoutes` path pattern trong Nest module middleware config KHÔNG dùng cú pháp `'{*path}'`** (đó là path-to-regexp v8, chỉ tương thích Nest 11+). Base này chạy Nest 10 + Express adapter (path-to-regexp v6) — pattern đúng là `'*'`. Dùng nhầm cú pháp Nest 11 ở đây KHÔNG throw lỗi lúc build hay boot, middleware chỉ lặng lẽ không match route nào (đã tự bắt được lỗi này lúc verify `pino-http` request logging — request chạy 200 OK bình thường nhưng không log nào xuất hiện). Luôn verify middleware `forRoutes` bằng 1 request thật, không chỉ tin vào build pass.
- **Password hash bằng `argon2` (Argon2id), tham số pin cố định trong `argon2-options.constant.ts`.** OWASP khuyến nghị Argon2id hơn bcrypt (chống GPU/ASIC brute-force tốt hơn vì tốn cả RAM lẫn CPU, không chỉ CPU). Tham số (`memoryCost: 19456, timeCost: 2, parallelism: 1`) thấp hơn default của package — cân nhắc vì `/auth/refresh` (`@Public()`, tần suất cao do access TTL ngắn) cũng hash bằng argon2 cho refresh token, cần giảm tải để không thành vector DoS. **Mọi lệnh `argon2.hash` trong repo PHẢI dùng chung `ARGON2_OPTIONS`** — lệch tham số giữa các lần gọi phá vỡ mục đích timing-safety của `DUMMY_HASH` (xem dòng dưới). `argon2` là native dependency đầu tiên của repo — Dockerfile cần build toolchain (`apk add python3 make g++`) ở stage nào compile nó, và cần `node:22-alpine` (không phải `20`) để khớp `pnpm@11.2.2`.
- **`AuthService.login()` chạy dummy `argon2.verify()` khi email không tồn tại**, trước khi throw `UnauthorizedException`. Đây là timing-attack mitigation — nếu bỏ nhánh dummy verify, response time của "email không tồn tại" (nhanh) khác "sai password" (chậm, chờ argon2), lộ ra email nào tồn tại trong hệ thống qua đo thời gian phản hồi. Message lỗi PHẢI generic (`'Invalid email or password'`) cho cả 2 trường hợp. Chú ý thứ tự tham số `argon2.verify(hash, plain)` — ngược với `bcryptjs.compare(plain, hash)`, dễ nhầm khi port code.
- **`env.schema.ts` throw lỗi boot nếu `NODE_ENV=production` và `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` vẫn là giá trị default, hoặc nếu 2 secret trùng nhau.** Giá trị default nằm trong source code (public), chỉ an toàn cho dev/skeleton — nếu vẫn dùng ở production, bất kỳ ai đọc được source đều tự ký được JWT hợp lệ cho user id bất kỳ. 2 secret phải khác nhau vì access và refresh token có mức độ nhạy cảm khác nhau (refresh sống lâu hơn, gắn với `AuthSession` revoke) — dùng chung 1 secret triệt tiêu lý do tách chúng.
- **Access token (15 phút) + refresh token (7 ngày) qua httpOnly cookie, không phải `Authorization: Bearer`.** `JwtStrategy` đọc access token từ cookie (`ACCESS_COOKIE_NAME`, `access-control/constants/auth-cookie.constants.ts`) qua `cookie-parser` middleware (bắt buộc đăng ký ở `main.ts` trước `useGlobalPipes`). Refresh token gắn với 1 row `AuthSession` (Postgres, lưu `argon2.hash(refreshToken)`) — cho phép revoke thật trước khi JWT tự hết hạn. `POST /auth/refresh` rotate bằng **compare-and-swap SQL** (`updateMany({ where: { id, refreshTokenHash: oldHash } })`), không phải read-then-write — nếu không atomic, 2 request refresh song song (multi-tab, parallel query) sẽ đá nhầm user hợp lệ ra vì tưởng nhầm là replay attack. Nếu phát hiện hash không khớp ngay từ đầu (refresh token cũ bị dùng lại) → `revokeAllUserSessions`, không chỉ 1 session — coi cả token family là compromised.
- **`OriginCheckGuard` (global `APP_GUARD`) là CSRF compensating control bắt buộc khi chuyển sang cookie auth.** Cookie tự động đính kèm vào request cross-site (khác `Authorization` header, browser không tự set) — chuyển sang cookie mà không có Origin check là mở lại đúng lỗ hổng mà thiết kế Bearer-header cũ miễn nhiễm. Guard chặn mọi request state-changing (không phải GET/HEAD/OPTIONS) có header `Origin` khác `WEB_ORIGIN`. Chỉ là baseline tối thiểu (không phải double-submit CSRF token đầy đủ) — đủ cho same-site deploy (`SameSite=Strict/Lax`), KHÔNG đủ nếu dự án con cần `SameSite=None` (FE/BE khác domain hẳn).
- **Seed script (`apps/api/scripts/seed-admin.ts`) đặt NGOÀI `src/`, khớp `generate-openapi.ts`.** `apps/api/tsconfig.json` include cả `src/**/*` lẫn `scripts/**/*` — nếu đặt seed trong `src/scripts/`, `nest build` sẽ compile nó lẫn vào build chính dù không ai import. Đặt ở `apps/api/scripts/` (ngang hàng `src/`) giữ nó tách biệt hoàn toàn khỏi runtime graph của app, chỉ chạy tay qua `ts-node`. Script cũng tự chặn khi `NODE_ENV=production` — seed password là credential dev-only, không nên tự động tạo trên môi trường thật.
- **Guard order trong `AccessControlModule` có 2 loại guarantee khác nhau, đừng gộp chung thành 1 giả định.** `JwtAuthGuard` → `PermissionsGuard` đăng ký CÙNG module, CÙNG array `providers` — NestJS DI đảm bảo thứ tự này (deterministic), an toàn để `PermissionsGuard` đọc `request.user` do `JwtAuthGuard` gắn vào. Ngược lại, `ThrottlerGuard` (đăng ký ở `AppModule`) chạy trước `AccessControlModule`'s guards hay không là **cross-module** `APP_GUARD` order — NestJS KHÔNG document guarantee này, chỉ là giả định best-effort.
- **`PermissionsGuard` PHẢI tự kiểm tra `@Public()` metadata, không chỉ dựa vào `JwtAuthGuard` đã bypass.** Route có cả `@Public()` VÀ `@RequirePermissions(...)` khiến `JwtAuthGuard` bỏ qua hoàn toàn (do `@Public()`), nên `request.user` là `undefined` khi tới `PermissionsGuard`. Nếu `PermissionsGuard` không tự check `@Public()` mà chỉ check `!user` rồi throw `ForbiddenException`, route này sẽ luôn 403 sai — bug này bị bắt bởi integration test (`access-control.integration.spec.ts`), không phải bởi tư duy đọc code.

## Common Mistakes to Avoid

| Category            | Don't                                                        | Do                                                                                            |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Module boundary** | Dùng `PrismaService` query trực tiếp bảng của module khác    | Inject Service đã export của module đó                                                        |
| **Service size**    | Để service phình to không giới hạn (case thực tế: 3657 dòng) | Tách `-read/-workflow/-shared` khi vượt 500 dòng hoặc >6 dependency                           |
| **Controller**      | Business logic trong controller                              | Đặt trong service                                                                             |
| **Auth**            | `@UseGuards(JwtAuthGuard)` thủ công                          | Auth đã global qua `AccessControlModule`; dùng `@Public()`/`@RequirePermissions()`            |
| **Events**          | Dùng `@OnEvent` cho mọi thứ để "decouple"                    | Chỉ dùng cho fire-and-forget, nhiều listener độc lập; case cần đồng bộ dùng Service injection |
