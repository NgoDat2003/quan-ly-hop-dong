# Brainstorm Report: Infra hardening cho base template (logging, shutdown, env)

## Bối cảnh

Base template (`create-project-from-template`) là structural skeleton cố ý để nhiều thứ ở dạng stub (auth guard, service). Câu hỏi gốc: "kiến trúc template project như này còn gì cần thêm ko" (scope: devops/frontend-development/backend-development).

Quyết định đã chốt trước đó (giữ nguyên, không xét lại): KHÔNG thêm CI/CD hay `compose.prod.yaml` vào base — pattern deploy khác nhau giữa các dự án cụ thể, đã brainstorm và ghi trong `base-template-conventions.md`.

## Scout findings

- Monorepo Turborepo/pnpm, `apps/api` (NestJS 10 + Prisma 7 adapter pattern + Postgres), `apps/web` (Next.js App Router + shadcn/ui + TanStack Query + Orval).
- Kiến trúc đã chỉn chu: envelope response, tách service `-read/-workflow/-shared`, tách FE action hook, Orval contract, `@nestjs/throttler` + `helmet` baseline.
- Không có `.github/` (chủ ý, theo quyết định CI/CD ở trên).
- `apps/api/src/config/env.schema.ts`: zod schema chỉ validate `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `WEB_ORIGIN` — thiếu `NODE_ENV`, `DATABASE_URL` (đúng, vì `DATABASE_URL` đọc trực tiếp qua Prisma adapter, không qua `ConfigService`).
- `apps/api/src/main.ts`: không có `enableShutdownHooks()`. `PrismaService` đã có `onModuleDestroy` sẵn nhưng không được gọi khi container nhận `SIGTERM`.
- Không có `.env.example` ở bất kỳ đâu trong repo dù README (dòng 24) ghi `cp .env.example apps/api/.env` — gap thật, không phải chủ ý (đối chiếu `git check-ignore` — không bị ignore, chỉ đơn giản chưa tồn tại).
- Không có pino/winston, chỉ NestJS default `Logger` (in text thô, không structured, không request-id correlation).
- `HealthController` đã có sẵn, dùng `@nestjs/terminus` + check DB qua `$queryRaw`.

## Cross-reference: maycha_QAQC_app (project tương tự, theo yêu cầu người dùng)

`D:\work\maycha\maycha_QAQC_app\apps\api` — cùng dạng NestJS monorepo, đã production-harden hơn. Dùng `nestjs-pino` (không phải winston):

- Deps: `nestjs-pino ^4.4.1`, `pino ^10.1.0`, `pino-http ^11.0.0`, `pino-pretty ^13.1.2` (dev).
- `foundation.module.ts`: `LoggerModule.forRootAsync` — `pinoHttp.level` = `info` (production) / `debug` (khác), `redact: ['req.headers.authorization']` che token khỏi log, `transport: pino-pretty` chỉ khi non-production, `forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }]`.
- `main.ts`: `NestFactory.create(AppModule, { bufferLogs: true })` rồi `app.useLogger(app.get<LoggerService>(Logger))` — thay Nest default logger toàn cục bằng pino, request-id tự động gắn qua `pino-http` middleware, không cần code tay.

Pattern này khớp thẳng vào cấu trúc `ConfigModule` + `env.schema.ts` hiện có của base — không cần kiến trúc mới, chỉ thêm 1 module.

## Đề xuất đã duyệt (3 hạng mục, ưu tiên hạ tầng)

### 1. `.env.example` ở root
Tạo file đúng vị trí README đã tham chiếu (root, không phải `apps/api/`), liệt kê biến app thật sự dùng:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/create_project_from_template
JWT_SECRET=dev-placeholder-secret
JWT_EXPIRES_IN=7d
PORT=3001
WEB_ORIGIN=http://localhost:3000
NODE_ENV=development
```

### 2. Graceful shutdown
`main.ts` thêm `app.enableShutdownHooks()` — 1 dòng, ăn khớp ngay với `PrismaService.onModuleDestroy` đã có sẵn, không cần code thêm ở Prisma layer.

### 3. Structured logging (nestjs-pino, theo pattern verified ở QAQC)
- Thêm deps: `nestjs-pino`, `pino-http` (dependencies); `pino-pretty` (devDependencies).
- `AppModule` (hoặc tách riêng `LoggingModule` nếu muốn giữ `app.module.ts` gọn): `LoggerModule.forRootAsync` đọc `NODE_ENV` qua `ConfigService`, redact `req.headers.authorization`, pino-pretty transport chỉ dev.
- `main.ts`: `bufferLogs: true` + `app.useLogger(app.get(Logger))`.
- `env.schema.ts`: thêm `NODE_ENV` (enum `development|production|test`, default `development`) — hiện chưa có biến này dù logic phân prod/dev cần nó.

## Việc kèm theo (đồng bộ tài liệu, theo `documentation-management.md`)

Sau khi implement, cập nhật `base-template-conventions.md`/`backend-architecture.md` ghi lại: lý do `bufferLogs: true`, lý do `redact` header authorization, vị trí đúng của `.env.example`, để quyết định không bị mất khi có thay đổi sau này (tương tự cách các gotcha khác đã được ghi lại trong 2 file này).

## Không đưa vào scope round này

Đã liệt kê nhưng để lại cho vòng sau, theo lựa chọn "ưu tiên hạ tầng trước" của người dùng:
- Backend: test hành vi thật (auth boundary), seed script.
- Frontend: DataTable mẫu + `-columns.ts` pattern, React Query global error handler.
- DX: husky/lint-staged.

## Next steps

Chuyển sang `/ck:plan` (default mode, không cần `--tdd` — đây là bổ sung hạ tầng mới, không refactor logic nghiệp vụ hiện có) để viết phase-by-phase cho 3 hạng mục trên.

## Unresolved questions

Không có.
