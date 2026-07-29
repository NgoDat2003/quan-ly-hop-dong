---
phase: 2
title: Structured logging with nestjs-pino
status: completed
priority: P1
effort: 1.5h
dependencies:
  - 1
---

# Phase 2: Structured logging with nestjs-pino

## Overview

Thay NestJS default `Logger` (text thô, không request-id) bằng `nestjs-pino` — JSON structured log, request-id tự động gắn qua `pino-http` middleware, redact header `Authorization` khỏi log, pretty-print chỉ khi dev.

## Key Insights (từ brainstorm + cross-reference)

- Pattern lấy trực tiếp từ `D:\work\maycha\maycha_QAQC_app\apps\api` (project tương tự, đã production-harden), đã verify qua đọc code thật — không phải suy đoán:
  - Deps: `nestjs-pino ^4.4.1`, `pino ^10.1.0`, `pino-http ^11.0.0` (dependencies); `pino-pretty ^13.1.2` (devDependencies).
  - `LoggerModule.forRootAsync` đọc `NODE_ENV` qua `ConfigService`, KHÔNG hardcode string so sánh trực tiếp `process.env`.
  - `pinoHttp.redact: ['req.headers.authorization']` — che token Bearer khỏi log, quan trọng vì base có JWT auth.
  - `pinoHttp.transport` chỉ set khi non-production (dùng `pino-pretty`, `colorize: true`) — production log ra JSON thuần cho log aggregator (ELK/Loki/CloudWatch) parse được.
  - `main.ts`: `NestFactory.create(AppModule, { bufferLogs: true })` — buffer log trong lúc DI container khởi tạo (trước khi `LoggerModule` sẵn sàng), tránh mất log/dùng nhầm console.log thô ở giai đoạn bootstrap sớm.
  - `app.useLogger(app.get<LoggerService>(Logger))` — thay Nest's internal logger toàn cục (Nest framework logs, ví dụ "Nest application successfully started", cũng đi qua pino).
- Base hiện tại **không có** file `foundation.module.ts` riêng như QAQC — quy mô base nhỏ hơn nhiều (chỉ 4 module: `access-control`, `auth`, `users`, `health`). Không cần tách `LoggingModule` riêng — đăng ký thẳng trong `AppModule` để giữ KISS, tránh over-engineer 1 module chỉ có 1 provider.
- `forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }]` (cú pháp Nest 10 wildcard) áp http logging middleware cho mọi route — giữ nguyên từ QAQC pattern.

## Requirements

- Functional: Mọi HTTP request được log dạng JSON (production) hoặc pretty-print có màu (dev), gồm request-id tự động.
- Functional: Header `Authorization` không bao giờ xuất hiện trong log dù ở level nào.
- Functional: Log level = `debug` khi `NODE_ENV` khác `production`, `info` khi `production`.
- Non-functional: Không phá health-check endpoint (`/health`) — endpoint này vẫn `@Public()` + `@ApiExcludeEndpoint()`, chỉ log request tới nó như mọi route khác (không cần loại trừ).
- Non-functional: `pino-pretty` chỉ nằm trong `devDependencies` — không kéo vào production bundle.

## Architecture

```
AppModule
├── ConfigModule.forRoot(...)          # đã có, cung cấp NODE_ENV qua ConfigService
├── LoggerModule.forRootAsync(...)     # MỚI — inject ConfigService, đọc NODE_ENV
│   └── pinoHttp: { level, redact, transport?, }
├── ThrottlerModule.forRoot(...)       # đã có, giữ nguyên thứ tự (throttle trước access-control)
└── ...

main.ts
├── NestFactory.create(AppModule, { bufferLogs: true })   # sửa: thêm option
├── app.useLogger(app.get(Logger))                         # MỚI — trước các app.use/app.useGlobalPipes khác
└── ...
```

## Related Code Files

- Modify: `apps/api/package.json` (thêm 4 deps)
- Modify: `apps/api/src/app.module.ts` (thêm `LoggerModule.forRootAsync`)
- Modify: `apps/api/src/main.ts` (thêm `bufferLogs: true`, `app.useLogger(...)`)

## Implementation Steps

1. Cài dependency trong `apps/api`:
   ```bash
   pnpm --filter=api add nestjs-pino pino-http
   pnpm --filter=api add -D pino-pretty
   ```
   (`pino` tự kéo theo như transitive dep của `pino-http`/`nestjs-pino` — verify sau khi cài, thêm dep tường minh nếu `pnpm` không tự resolve.)
2. Sửa `apps/api/src/app.module.ts`: import `LoggerModule` từ `nestjs-pino`, `ConfigService` từ `@nestjs/config`, `RequestMethod` từ `@nestjs/common`. Thêm vào mảng `imports` (đặt sau `ConfigModule.forRoot`, trước hoặc sau `ThrottlerModule` đều được vì không phụ thuộc guard order):
   ```typescript
   LoggerModule.forRootAsync({
     imports: [ConfigModule],
     inject: [ConfigService],
     useFactory: (configService: ConfigService) => {
       const nodeEnv = configService.get<string>('NODE_ENV', 'development');
       return {
         pinoHttp: {
           level: nodeEnv === 'production' ? 'info' : 'debug',
           redact: ['req.headers.authorization'],
           transport:
             nodeEnv === 'production'
               ? undefined
               : {
                   target: 'pino-pretty',
                   options: { colorize: true, ignore: 'pid,hostname', singleLine: false, translateTime: 'SYS:standard' },
                 },
         },
         forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
       };
     },
   }),
   ```
3. Sửa `apps/api/src/main.ts`:
   - Import `Logger` từ `nestjs-pino`, `LoggerService` type từ `@nestjs/common`.
   - `NestFactory.create(AppModule, { bufferLogs: true })`.
   - Ngay sau dòng tạo `app`, thêm `app.useLogger(app.get<LoggerService>(Logger));` — trước `app.use(helmet(...))`.
4. Chạy `pnpm --filter=api check-types` và `pnpm --filter=api build`.
5. Verify thủ công: `pnpm --filter=api dev`, gọi `curl http://localhost:3001/health`, xác nhận log ra JSON/pretty có field request-id, timestamp, method, url, status. Gọi 1 endpoint có `Authorization: Bearer xxx` header (vd `/auth/me` nếu có sẵn stub token), xác nhận log không in giá trị token thật (field bị redact hiển thị `[Redacted]` hoặc tương tự).

## Success Criteria

- [ ] `apps/api/package.json` có `nestjs-pino`, `pino-http` (dependencies), `pino-pretty` (devDependencies).
- [ ] `pnpm --filter=api build` và `check-types` pass.
- [ ] Chạy dev server, mỗi request in ra log JSON/pretty có request-id.
- [ ] Header `Authorization` bị redact trong log (verify bằng request thật kèm Bearer token).
- [ ] Log level đổi đúng theo `NODE_ENV` (test bằng cách set `NODE_ENV=production` tạm thời, xác nhận log chuyển sang JSON thuần không màu và ẩn debug-level log).
- [ ] Nest framework log (vd dòng "Nest application successfully started") vẫn xuất hiện, đi qua pino thay vì console gốc.

## Risk Assessment

- **Thứ tự `useLogger` sai vị trí** → log bootstrap sớm (trước `useLogger`) vẫn dùng Nest default console — chấp nhận được vì `bufferLogs: true` đã giữ log này lại, không mất, chỉ format khác nhẹ.
- **`pino-pretty` lọt vào production build** nếu import nhầm — do đặt trong `devDependencies` và chỉ nạp qua `transport` field (dynamic, không static import), Nest sẽ không cố `require` nó khi `NODE_ENV=production` (do `transport: undefined`).

## Security Considerations

`redact: ['req.headers.authorization']` là bắt buộc, không phải optional — thiếu dòng này, mọi JWT Bearer token sẽ nằm nguyên trong log, rủi ro rò rỉ nếu log được ship sang service thứ 3 (log aggregator) hoặc file log bị truy cập trái phép.
