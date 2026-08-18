# Backend — Giải thích cấu hình nền (baseline) hiện tại

**Mục đích tài liệu:** phần cấu hình "nền" của `apps/api` (bootstrap, guard, validation, logging...) do AI implement trước đó. File này liệt kê **từng cấu hình đang có, tại sao nó tồn tại**, dựa trên đọc trực tiếp code — không suy đoán. Dùng để tự thẩm định lại thay vì tin mù.

**Không trùng với** `security-audit-full-project.md` (báo cáo red-team tìm lỗ hổng, không commit git). File này là bản đồ "cái gì có sẵn + vì sao", đọc trước khi đọc audit.

---

## 1. `main.ts` — Bootstrap

| Dòng | Cấu hình | Tại sao |
|---|---|---|
| `main.ts:8` `import 'dotenv/config'` | Load `.env` thủ công **trước** mọi import khác | `ConfigModule.forRoot()` của NestJS chỉ nạp giá trị vào `ConfigService` — không đảm bảo `process.env` được điền cho code đọc `process.env` trực tiếp (vd `PrismaService` chạy lúc DI container build, trước khi `ConfigModule` kịp init). Nếu không có dòng này, `PrismaService` có thể đọc `DATABASE_URL` là `undefined` lúc bootstrap. |
| `main.ts:23` `bufferLogs: true` | Giữ log framework (Nest module init...) trong bộ đệm | Tránh log bị in ra bằng console logger mặc định trước khi pino logger (dòng 24) được gắn vào — nếu không buffer, log khởi động sẽ format khác/lẫn lộn với log pino sau đó. |
| `main.ts:28` `app.enableShutdownHooks()` | Bật lifecycle hook khi nhận `SIGTERM` | Nếu không có dòng này, `PrismaService.onModuleDestroy()` (đóng kết nối DB) **không bao giờ chạy** khi container orchestrator (Docker/K8s) dừng process — kết nối DB bị cắt đột ngột thay vì đóng sạch. |
| `main.ts:32` `helmet({ contentSecurityPolicy: false })` | Set HTTP security headers, tắt CSP | Helmet mặc định set nhiều header bảo mật (HSTS, X-Content-Type-Options, X-Frame-Options...). CSP bị tắt riêng vì Swagger UI (mount ở `/api`) dùng inline script/style mà CSP mặc định của helmet sẽ chặn — các header khác vẫn hoạt động bình thường. |
| `main.ts:33-35` `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` | Validate + strip input toàn cục | `whitelist`: field không khai báo trong DTO bị tự động xóa khỏi payload. `forbidNonWhitelisted`: nếu client gửi field lạ → trả lỗi 400 thay vì âm thầm bỏ qua. `transform`: convert payload thô (string từ query/body) sang đúng type khai báo trong DTO (vd string "5" → number 5). Đây là pattern chuẩn NestJS để chặn mass-assignment và input rác từ tầng framework, không cần validate tay từng field trong service. |
| `main.ts:36` `useGlobalInterceptors(new TransformInterceptor())` | Bọc mọi response thành `{ statusCode, data }` | Chuẩn hóa format response — khớp với `## API Response Format` trong CLAUDE.md của repo. Không cần mỗi controller tự viết lại wrapper. |
| `main.ts:37` `useGlobalFilters(new HttpExceptionFilter())` | Bắt toàn bộ exception, format lỗi đồng nhất | Xem chi tiết mục 4 bên dưới. |
| `main.ts:38` `enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true })` | Chỉ cho phép 1 origin cụ thể gọi API, kèm cookie/credentials | Không dùng `origin: '*'` (sẽ chặn mọi credentialed request theo spec CORS, và cũng là anti-pattern bảo mật nếu API có auth). Origin lấy từ env để đổi được giữa dev/prod mà không sửa code. |
| `main.ts:40-45` `DocumentBuilder` + `SwaggerModule.setup('api', ...)` | Sinh Swagger UI tại `/api` | Đây **không chỉ là tài liệu** — đây là nguồn OpenAPI JSON mà Orval ở frontend đọc để tự sinh fetch function + React Query hooks (`CLAUDE.md` mục "CRITICAL: API Contract qua Orval"). Không có bước này thì FE không tự sinh code được. |
| `main.ts:47` `app.listen(process.env.PORT ?? 3001)` | Port lấy từ env, fallback 3001 | Cho phép override port khi deploy (nhiều container cùng máy) mà không sửa code. |

**Điểm cần biết:** Swagger mount **vô điều kiện**, kể cả `NODE_ENV=production` — không có gate theo môi trường. README của repo có ghi chú "đừng deploy skeleton này trực tiếp", nhưng bản thân code không tự chặn việc đó. Đã được audit ghi nhận ở mức "Trung bình" trong `security-audit-full-project.md` (finding #7).

---

## 2. `app.module.ts` — Module gốc

| Cấu hình | Tại sao |
|---|---|
| `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` | `isGlobal: true` để mọi module inject `ConfigService` mà không cần import lại `ConfigModule` ở từng module con. `validate: validateEnv` chạy zod schema (xem mục 3) ngay lúc app khởi động — sai biến môi trường thì app **crash lúc boot**, không chạy ngầm rồi lỗi runtime khó truy vết sau. |
| `LoggerModule.forRootAsync(...)` (nestjs-pino) | Thay logger mặc định của Nest (text, khó parse) bằng JSON structured logging — cần thiết nếu sau này đẩy log vào hệ thống aggregator (Datadog, Loki...). `level` đổi theo `NODE_ENV`: `debug` lúc dev, `info` lúc production (giảm nhiễu log). `transport: pino-pretty` chỉ bật khi **không phải** production — dev thấy log màu dễ đọc, production log JSON thuần cho máy đọc. |
| `redact: ['req.headers.authorization']` | Xóa header `Authorization` khỏi log request | Chặn rò rỉ JWT bearer token vào log/log aggregator — ai đọc log cũng không lấy được token của user khác. |
| `forRoutes: [{ path: '*', method: RequestMethod.ALL }]` | Áp middleware log cho **mọi** route | Comment trong code (dòng 54-59) ghi rõ: dùng `'*'` (không phải `'{*path}'` — cú pháp Nest 11) vì app đang chạy Nest 10 với `path-to-regexp` v6; `'{*path}'` sẽ **âm thầm không match route nào** (không lỗi lúc build/boot, nhưng middleware không bao giờ chạy). Đã verify thực tế bằng request thật lúc implement — đây là bài học để lại tránh lặp lại nếu sau này nâng cấp Nest 11. |
| `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])` | Rate limit toàn cục: 100 request / 60 giây / IP | Chặn brute-force/spam cơ bản ở tầng framework. Đây là con số mặc định phẳng — **chưa** phân tầng riêng cho route nhạy cảm (vd login) — xem mục "Khoảng trống" cuối file. |
| Thứ tự khai báo `ThrottlerModule` **trước** `AccessControlModule` trong mảng `imports` | Comment dòng 64-72 giải thích rõ: kỳ vọng `ThrottlerGuard` (rẻ, không cần DB/JWT) chạy **trước** `JwtAuthGuard`/`PermissionsGuard` trong chuỗi `APP_GUARD`. Nhưng **NestJS không document đảm bảo thứ tự thực thi** giữa các `APP_GUARD` provider đăng ký ở module khác nhau (chỉ đảm bảo thứ tự cho `@UseGuards()` cùng 1 mảng). Code tự ghi chú: cần re-verify bằng thực nghiệm khi `PermissionsGuard` có logic thật đọc `request.user` — điều này **đã xảy ra rồi** (xem mục 3), nên đây là điểm cần 1 test integration xác nhận thứ tự thực thi thật, hiện chưa thấy test đó tồn tại. |
| `providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]` | Đăng ký `ThrottlerGuard` chạy global cho mọi route | Không cần `@UseGuards(ThrottlerGuard)` thủ công ở từng controller. |

---

## 3. Auth & Access Control (`modules/access-control/`)

### 3.1 Luồng guard toàn cục

Có **3 `APP_GUARD`** đăng ký global (không cần `@UseGuards()` thủ công trên controller):

1. `ThrottlerGuard` (từ `app.module.ts`)
2. `JwtAuthGuard` (từ `access-control.module.ts:29`, comment ghi "runs first")
3. `PermissionsGuard` (từ `access-control.module.ts:30`, comment ghi "runs second")

**Tại sao global thay vì decorator thủ công mỗi route:** tránh quên gắn guard ở route mới — mặc định mọi route đều bị auth-check, muốn public thì phải **chủ động** đánh dấu `@Public()` (fail-safe theo hướng an toàn hơn — quên đánh dấu thì route bị khóa nhầm, không phải mở nhầm).

### 3.2 `JwtAuthGuard` (`guards/jwt-auth.guard.ts`)

- Kiểm tra metadata `@Public()` qua `Reflector.getAllAndOverride` ở **cả 2 cấp** — handler (method) và class (controller) — trước khi quyết định có gọi `super.canActivate()` (Passport JWT strategy thật) hay không.
- **Tại sao check cả 2 cấp:** cho phép đánh dấu `@Public()` ở cấp class (toàn bộ controller public) hoặc cấp method (1 route lẻ trong controller có auth) mà không phải lặp lại.

### 3.3 `PermissionsGuard` (`guards/permissions.guard.ts`)

- Comment dòng 12-14 giải thích lý do phải lặp lại check `@Public()` ở đây: route có `@Public()` sẽ bị `JwtAuthGuard` bỏ qua hoàn toàn → `request.user` **không tồn tại** trên request đó. Nếu `PermissionsGuard` không tự check `@Public()` riêng, 1 route vừa `@Public()` vừa `@RequirePermissions(...)` (dù là kết hợp lạ) sẽ luôn bị 403 vì đọc `user` là `undefined`.
- Nếu route không có `@RequirePermissions(...)` nào → mặc định pass (`required.length === 0 → return true`). Nghĩa là **không gắn decorator = không giới hạn permission**, chỉ vẫn cần đăng nhập (do `JwtAuthGuard` xử lý riêng).
- Logic thật: `hasPermission(user.role, required)` — đọc từ `role-permissions.ts`.

### 3.4 `role-permissions.ts` — Bảng phân quyền

```ts
ADMIN: ['*']     // mọi permission
TRAINER: []      // rỗng — chưa có quyền nào
TRAINEE: []      // rỗng — chưa có quyền nào
```

**Tại sao rỗng:** đây là **khoảng trống thiết kế có chủ đích**, không phải bug — audit đã xác nhận (finding #8, mức "Thông tin"). Ý nghĩa: `@RequirePermissions(...)` gắn cho route tương lai hiện chỉ thỏa mãn được với role `ADMIN` cho tới khi ai đó tự điền mảng permission cho `TRAINER`/`TRAINEE`. TypeScript/NestJS không cảnh báo gì lúc compile về việc "quên điền" — đây là điều cần nhớ thủ công khi thêm module nghiệp vụ mới.

### 3.5 `JwtStrategy` (`strategies/jwt.strategy.ts`)

- `jwtFromRequest`: custom extractor đọc `request.cookies[ACCESS_COOKIE_NAME]` (từ `access-control/constants/auth-cookie.constants.ts`) — **không phải** `ExtractJwt.fromAuthHeaderAsBearerToken()` nữa. Cần `cookie-parser` middleware đăng ký ở `main.ts` trước `useGlobalPipes`, nếu không `request.cookies` luôn `undefined`.
- `secretOrKey: config.get('JWT_ACCESS_SECRET') ?? 'dev-placeholder-access-secret'` — verify **chỉ** access token bằng secret riêng. Refresh token dùng secret khác (`JWT_REFRESH_SECRET`), verify thủ công trong `AuthService.refresh()`/`logout()` qua `jwtService.verifyAsync(token, { secret: refreshSecret })` — `JwtStrategy` không bao giờ thấy refresh token.
- `validate(payload)` tra DB **tươi mỗi request** qua `UsersService.findById(payload.sub)` thay vì tin payload JWT chứa sẵn role. **Tại sao:** nếu role đổi (admin hạ quyền 1 user), JWT cũ (còn hạn 15 phút) sẽ **không** còn mang quyền cũ — vì role luôn lấy lại từ DB, không nhét vào token. Đánh đổi: tốn 1 query DB mỗi request có auth.
- **Chưa có** `algorithms: ['HS256']` tường minh trong config — audit ghi nhận đây là khoảng trống mức "Thông tin" (không có đường khai thác thật vì hệ thống chỉ dùng secret đối xứng, không có cặp khóa RSA nào để gây "alg confusion" attack) — nhưng nên thêm để phòng ngừa nhiều lớp, chi phí gần như 0.

### 3.6 `AccessControlModule` — vì sao `@Global()`

Đánh dấu `@Global()` để `JwtModule` (export ở dòng 32) dùng được ở module khác mà không cần import lại — tương tự lý do `ConfigModule.isGlobal`. `JwtModule.registerAsync` đăng ký **access** secret làm default provider (dùng cho `JwtStrategy` và mọi nơi ký/verify access token không truyền `secret` tường minh) — **refresh** secret luôn truyền per-call, không bao giờ là default, để tránh nhầm lẫn 2 loại token dùng chung 1 secret.

### 3.7 Access + refresh token, session revoke qua `AuthSession`

`JWT_ACCESS_TTL` mặc định `15m` (ngắn, để giảm thời gian hiệu lực nếu access token bị lộ), `JWT_REFRESH_TTL` mặc định `7d`. Refresh token không chỉ là 1 JWT dài hạn hơn — nó gắn với 1 row `AuthSession` (Postgres) lưu `argon2.hash(refreshToken)`, cho phép revoke thật trước khi JWT tự hết hạn:

- `POST /auth/refresh`: verify chữ ký refresh token → tra `AuthSession` theo `sid` trong payload → so hash → nếu khớp, **rotate atomic** bằng compare-and-swap SQL (`UPDATE ... WHERE id = sid AND refreshTokenHash = oldHash`) — 2 request refresh song song (race condition, ví dụ nhiều tab/query cùng lúc) không đá nhầm user ra, chỉ request thua cuộc nhận lỗi retry-able.
- Nếu hash **không khớp** ngay từ đầu (refresh token cũ, đã bị rotate từ trước, giờ bị dùng lại) → coi là dấu hiệu token bị đánh cắp, `revokeAllUserSessions` — revoke **toàn bộ** session của user đó, không chỉ session bị nghi ngờ (chuẩn OAuth BCP cho token family compromise).
- `POST /auth/logout`: đánh dấu `@Public()` có chủ đích — phải hoạt động được cả khi access token đã hết hạn (trường hợp phổ biến: user đóng tab cũ). Tự verify refresh cookie bên trong service, best-effort (không throw nếu thiếu/invalid).

Không có `/auth/register` công khai — dùng seed script (`scripts/seed-admin.ts`) để tạo user thay vì self-registration. Đây vẫn là quyết định phạm vi có chủ đích, không đổi so với bản trước.

---

## 4. Error handling & Response format

### 4.1 `HttpExceptionFilter` (`common/filters/http-exception.filter.ts`)

- `@Catch()` không tham số → bắt **mọi** loại exception, kể cả lỗi không phải do code chủ động throw (vd lỗi Prisma, lỗi runtime bất ngờ).
- Nhánh `if (!(exception instanceof HttpException))` (dòng 10-19): nếu exception **không** phải `HttpException` (nghĩa là lỗi không định trước, có thể chứa message/stack nội bộ nhạy cảm) → trả về message chung chung `'Internal server error'`, **không bao giờ** lộ `exception.message` hay stack trace ra response. Chỉ có exception được chủ động `throw new HttpException(...)` (hoặc subclass như `NotFoundException`) mới được coi là "an toàn để hiển thị message thật" — vì message đó do lập trình viên tự viết có chủ đích cho client đọc.
- **Tại sao quan trọng:** ngăn rò rỉ chi tiết implementation (đường dẫn file, tên bảng DB, cấu trúc query lỗi...) ra ngoài cho client — một dạng thông tin trinh sát (reconnaissance) hữu ích cho kẻ tấn công nếu để lộ.

### 4.2 `TransformInterceptor` (`common/interceptors/transform.interceptor.ts`)

- Bọc **mọi** response thành công thành `{ statusCode, data }`.
- Comment dòng 5-7 tự ghi chú: shape này **phải khớp** với `ApiResponseDto` (`common/dto/api-response.dto.ts`) dùng cho Swagger schema — nếu đổi 1 trong 2 chỗ mà quên đổi chỗ kia, OpenAPI doc sẽ **không khớp** response thật, kéo theo Orval sinh type sai ở frontend mà không có cảnh báo nào lúc build.

---

## 5. Environment validation (`config/env.schema.ts`)

- Dùng **zod** (không phải class-validator) để validate biến môi trường — khác công cụ với validate DTO request (`class-validator`). Đây là 2 tầng validate riêng biệt, không chồng chéo: zod cho config lúc boot, class-validator cho request body lúc runtime.
- Mỗi biến có `.default(...)` khớp đúng giá trị fallback đã hardcode sẵn trong code (`JwtStrategy` fallback `'dev-placeholder-access-secret'`, `AuthService` fallback `'dev-placeholder-refresh-secret'`) — không thắt chặt thêm gì so với hành vi "boot được kể cả không có `.env`" đã có sẵn, chỉ biến 1 giá trị sai-format thành lỗi rõ ràng lúc boot thay vì lỗi khó hiểu lúc runtime.
- **Guard đặc biệt**: nếu `NODE_ENV=production` **và** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` vẫn là giá trị mặc định tương ứng → **throw, từ chối boot** (kiểm tra riêng từng secret). Lý do: 2 secret mặc định này nằm công khai trong source code (đã commit git) — nếu chạy production mà quên set secret thật, bất kỳ ai đọc được source (public repo, hoặc leak) đều có thể tự ký JWT giả mạo cho bất kỳ user nào. Ngoài ra, guard còn từ chối boot nếu `JWT_ACCESS_SECRET === JWT_REFRESH_SECRET` (dù cả 2 đều không phải giá trị mặc định) — dùng chung 1 secret cho 2 loại token triệt tiêu lý do tách chúng ra ngay từ đầu (access token bị lộ sẽ đồng thời cho phép giả mạo refresh token). Đây là hàng rào an toàn bắt buộc, không phải tùy chọn.

---

## 6. Database (`prisma/prisma.service.ts`)

- `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy` — tận dụng lifecycle hook của Nest để tự `$connect()` lúc module init và `$disconnect()` lúc module destroy (phối hợp với `enableShutdownHooks()` ở mục 1).
- `adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })` — comment dòng 5-8 giải thích: **Prisma 7 yêu cầu driver adapter tường minh**, không còn tự đọc `DATABASE_URL` ngầm từ schema như bản cũ. Đây không phải lựa chọn tối ưu hóa, mà là **bắt buộc theo API mới của Prisma 7** — cùng 1 env var mà `prisma.config.ts` (dùng cho CLI migrate/generate) cũng đọc, đảm bảo runtime và CLI trỏ cùng 1 database.
- Đọc `process.env.DATABASE_URL` trực tiếp (không qua `ConfigService`) — đây chính là lý do `main.ts:8` phải `import 'dotenv/config'` sớm (mục 1): `PrismaService` được construct trong lúc Nest build DI container, **trước khi** `ConfigModule.forRoot()` kịp chạy, nên không thể dựa vào `ConfigService` ở đây.

---

## Bảng tổng hợp: cấu hình nào bảo vệ khỏi rủi ro gì

| Cấu hình | Chống lại |
|---|---|
| `helmet()` | Clickjacking, MIME-sniffing, một số XSS vector qua header |
| `ValidationPipe` whitelist + forbidNonWhitelisted | Mass assignment, field lạ không mong muốn trong payload |
| `ThrottlerModule` | Brute-force cơ bản, spam request |
| CORS origin cụ thể | Request giả mạo từ origin lạ (đặc biệt quan trọng vì `credentials: true`) |
| `HttpExceptionFilter` che message lỗi không định trước | Rò rỉ thông tin nội bộ (stack trace, tên bảng, query lỗi) |
| `redact: ['req.headers.authorization']` | Rò rỉ JWT token qua log |
| Guard chặn boot production với `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` mặc định hoặc trùng nhau | Giả mạo JWT bằng secret công khai trong source; access token bị lộ đồng thời cho phép giả mạo refresh token nếu 2 secret trùng |
| `JwtStrategy.validate()` tra DB tươi mỗi request | JWT cũ giữ quyền cũ sau khi bị hạ quyền/thu hồi |
| `whitelist` global auth (mọi route auth-required trừ khi đánh dấu `@Public()`) | Quên gắn auth guard ở route mới (fail-safe theo hướng khóa nhầm, không phải mở nhầm) |

---

## Khoảng trống đã biết (không phải lỗi, nhưng đáng cân nhắc trước khi lên production thật)

Đây là các điểm **đã được audit ghi nhận** (`security-audit-full-project.md`) hoặc quan sát thêm khi đọc code lần này — liệt kê lại ở đây vì liên quan trực tiếp câu hỏi "cấu hình nền còn thiếu gì":

1. **Swagger không gate theo `NODE_ENV`** (`main.ts:45`) — mount vô điều kiện. Audit finding #7, mức Trung bình.
2. ~~Rate limit chưa phân tầng~~ **Đã giải quyết**: `/auth/login` và `/auth/refresh` có `@Throttle({ default: { limit: 5, ttl: minutes(1) } })` riêng, tách khỏi throttle global 100 req/phút — thêm khi implement access+refresh token, vì `/auth/refresh` giờ `@Public()` và verify password bằng argon2 (tốn CPU/RAM hơn hẳn so-sánh JWT thuần), cần rate-limit chặt hơn để chống DoS.
3. **Thứ tự `APP_GUARD` chưa có test xác nhận thực nghiệm** — vẫn còn đúng, chưa nằm trong phạm vi nâng cấp auth access/refresh token. `app.module.ts` giờ có thêm `OriginCheckGuard` (CSRF compensating control) đăng ký `APP_GUARD` thứ 4 — guard này không phụ thuộc `request.user` nên vị trí tương đối với `JwtAuthGuard`/`PermissionsGuard` không quan trọng, nhưng thứ tự `ThrottlerGuard → JwtAuthGuard → PermissionsGuard` vẫn chưa có test integration xác nhận.
4. **`JwtStrategy` chưa allowlist `algorithms: ['HS256']`** — vẫn còn đúng, mức Thông tin, chi phí sửa gần như 0.
5. **`ROLE_PERMISSIONS` rỗng cho `TRAINER`/`TRAINEE`** — vẫn còn đúng, cần nhớ điền khi thêm route nghiệp vụ dùng các role này.
6. **Không có audit-log table cho sự kiện đăng nhập/phân quyền** — vẫn còn đúng. **Lưu ý:** `AuthSession` (thêm khi implement access+refresh token) **KHÔNG phải** audit-log — nó là bảng session-đang-sống, bị `UPDATE`/xóa khi rotate/revoke, không phải append-only. Không dùng nó để trả lời "user X từng đăng nhập lúc nào trong quá khứ" — chỉ trả lời được "session nào đang hoạt động ngay bây giờ".
7. **Không có `trust proxy` config** — nếu deploy sau reverse proxy (Nginx/Caddy/load balancer), rate limit theo IP và log IP sẽ đọc sai (đọc IP của proxy thay vì client thật) trừ khi set `app.set('trust proxy', 1)`. Chưa thấy dòng này trong `main.ts`. Quan trọng hơn trước vì giờ có `OriginCheckGuard` và `@Throttle` riêng cho `/auth/*` — cả 2 đều dựa 1 phần vào network-layer info có thể bị proxy làm sai lệch.
8. **Không có body size limit tường minh** — dựa vào default ẩn của Express, chưa set rõ trong `main.ts`.
9. **`OriginCheckGuard` chỉ là compensating control tối thiểu, không phải CSRF token đầy đủ** — dựa vào header `Origin` (dễ giả mạo hơn double-submit token nếu attacker kiểm soát được request từ non-browser client, dù browser thật không cho JS tùy ý set `Origin`). Đủ cho same-site deploy (khuyến nghị mặc định của base) — nếu dự án con cần `SameSite=None` (FE/BE khác domain hẳn), phải tự thêm CSRF token đầy đủ, xem README.md mục "Lưu ý bảo mật: cookie-based auth + CSRF".

Không mục nào trong 9 điểm trên là "khẩn cấp" cho 1 skeleton chưa deploy — nhưng đều là việc cần làm **trước** khi dự án con dựa trên base này lên production thật, vì lúc đó rủi ro lý thuyết trở thành rủi ro thật.
