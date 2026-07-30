---
phase: 4
title: Seed script
status: completed
priority: P2
effort: 30m
dependencies:
  - 1
---

# Phase 4: Seed script

## Overview

Thêm 1 script tạo user admin đầu tiên với password đã hash, chạy qua `pnpm --filter=api seed`, dùng `NestFactory.createApplicationContext(AppModule)` (idiomatic NestJS, verified qua research) — KHÔNG tách `SeederModule` riêng, giữ gọn theo KISS vì base này chỉ cần 1 seed đơn giản.

## Key Insights

- Research đề xuất `SeederModule` tách biệt khỏi `AppModule` — nhưng với base nhỏ (4 module hiện có), tách thêm 1 module chỉ để chứa 1 seed script là over-engineer. Dùng thẳng `NestFactory.createApplicationContext(AppModule)` — vẫn có đầy đủ DI (Prisma, bcryptjs) mà không cần module mới.
- Seed không nên tự động chạy trong `pnpm dev`/`pnpm build` — chỉ chạy khi gọi tường minh, tránh vô tình ghi đè data dev đang có.
- Cân nhắc: seed nên **idempotent** (chạy nhiều lần không lỗi/không tạo trùng) — dùng `upsert` thay vì `create`, để dev chạy lại seed không bị lỗi unique constraint trên email.
- **[Red-team fix]** Vị trí file PHẢI ở `apps/api/scripts/` (NGOÀI `src/`), khớp đúng convention `generate-openapi.ts` đã có sẵn — KHÔNG đặt trong `src/scripts/`. `apps/api/tsconfig.json` có `"include": ["src/**/*", "scripts/**/*"]`, nghĩa là `src/**/*` bị `nest build` cuốn vào compile chính, còn `scripts/**/*` (ở `apps/api/scripts/`, ngang hàng `src/`) chỉ chạy tay qua `ts-node`, không lẫn vào `dist/` của app chính. Đặt sai vị trí khiến `nest build` compile luôn 1 file có side-effect (gọi `seed()` ngay khi bị import) lẫn vào output runtime.
- **[Red-team fix]** `tsconfig-paths` KHÔNG tồn tại trong `apps/api/package.json` devDependencies (verify qua grep) — KHÔNG dùng `-r tsconfig-paths/register`. Repo dùng import tương đối (xem `generate-openapi.ts:6`: `import { AppModule } from '../src/app.module';`), không cần path alias.
- **[Red-team fix]** Theo convention `generate-openapi.ts:9` (`NestFactory.create(AppModule, { logger: false })`), seed script cũng nên tắt logger đầy đủ (`{logger: false}`) — tránh boot toàn bộ pino-pretty transport (worker thread) cho 1 script chạy tay chỉ cần in vài dòng console.log.
- **[Red-team fix]** Thêm `process.exit(0)` sau `app.close()` ở nhánh thành công — nếu không, pino-pretty transport (worker thread) có thể khiến process không tự thoát, script "treo" dù đã xong việc. Dùng `{logger: false}` ở trên đã giảm rủi ro này, nhưng vẫn giữ `process.exit(0)` tường minh cho chắc chắn.
- **[Security hardening, chốt qua AskUserQuestion]** Thêm guard nhỏ: nếu `NODE_ENV === 'production'`, script từ chối chạy với message rõ ràng — seed password hardcode chỉ an toàn cho dev/skeleton, không nên tự động seed vào môi trường production mà không cảnh báo.

## Requirements

- Functional: `pnpm --filter=api seed` tạo/cập nhật 1 user admin với email/password cố định, `role: ADMIN`, password đã hash qua `bcryptjs`.
- Non-functional: Idempotent — chạy lại không throw lỗi unique constraint.
- Non-functional: Không tự động chạy trong bất kỳ script `dev`/`build`/`test` nào có sẵn.
- Non-functional: Từ chối chạy nếu `NODE_ENV=production` (an toàn hơn là im lặng seed weak password vào prod).

## Architecture

```
apps/api/scripts/seed-admin.ts        # NGOÀI src/, khớp generate-openapi.ts
  → NestFactory.createApplicationContext(AppModule, { logger: false })
  → app.get(PrismaService)
  → prisma.user.upsert({ where: { email }, update: {}, create: { ...hashed password... } })
  → app.close()
  → process.exit(0)
```

## Related Code Files

- Create: `apps/api/scripts/seed-admin.ts`
- Modify: `apps/api/package.json` (thêm script `seed`)

## Implementation Steps

1. Tạo `apps/api/scripts/seed-admin.ts` (lưu ý: ở `apps/api/scripts/`, KHÔNG phải `apps/api/src/scripts/`):
   ```typescript
   import 'reflect-metadata';
   import { NestFactory } from '@nestjs/core';
   import * as bcryptjs from 'bcryptjs';
   import { AppModule } from '../src/app.module';
   import { PrismaService } from '../src/prisma/prisma.service';
   import { Role } from '../src/generated/prisma/enums';

   const ADMIN_EMAIL = 'admin@example.com';
   const ADMIN_PASSWORD = 'admin12345'; // dev-only seed password, không dùng cho production thật

   async function seed() {
     if (process.env.NODE_ENV === 'production') {
       console.error('Refusing to run seed-admin in production (NODE_ENV=production). Seed data is dev-only.');
       process.exit(1);
     }

     const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
     const prisma = app.get(PrismaService);
     const hashedPassword = await bcryptjs.hash(ADMIN_PASSWORD, 12);

     await prisma.user.upsert({
       where: { email: ADMIN_EMAIL },
       update: {},
       create: {
         email: ADMIN_EMAIL,
         name: 'Admin User',
         password: hashedPassword,
         role: Role.ADMIN,
       },
     });

     console.log(`Seeded admin user: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
     await app.close();
     process.exit(0);
   }

   seed().catch((error) => {
     console.error('Seed failed:', error);
     process.exit(1);
   });
   ```
2. Thêm script vào `apps/api/package.json`: `"seed": "ts-node scripts/seed-admin.ts"` — khớp đúng pattern `"openapi:generate": "ts-node scripts/generate-openapi.ts"` đã có, KHÔNG thêm `-r tsconfig-paths/register`.
3. Chạy `pnpm --filter=api seed` với Postgres đã bật (`docker compose up -d --wait` — dùng flag `--wait` để đợi healthcheck pass trước khi seed chạy, tránh race condition Postgres chưa sẵn sàng nhận connection) — verify user được tạo, chạy lại lần 2 không lỗi (idempotent).
4. Chạy `pnpm --filter=api check-types` và `pnpm --filter=api build` — xác nhận `dist/` KHÔNG chứa artifact từ `scripts/seed-admin.ts` (vì nó nằm ngoài `src/`, `nest build` không đụng tới).
5. Verify `NODE_ENV=production pnpm --filter=api seed` (set biến tạm) → script từ chối chạy, không tạo user.

## Success Criteria

- [ ] File ở đúng vị trí `apps/api/scripts/seed-admin.ts` (không phải `src/scripts/`).
- [ ] `pnpm --filter=api seed` chạy thành công, tạo user `admin@example.com` với password đã hash.
- [ ] Chạy lại `pnpm --filter=api seed` lần 2 không lỗi (idempotent qua `upsert`).
- [ ] `pnpm --filter=api build` không bị ảnh hưởng bởi file script mới — `dist/` không chứa `seed-admin.js`.
- [ ] Password trong DB là hash, không phải plaintext (verify qua `psql` hoặc Prisma Studio).
- [ ] `NODE_ENV=production pnpm --filter=api seed` từ chối chạy, thoát với exit code khác 0.
- [ ] Script tự thoát process sau khi xong việc (không treo).

## Risk Assessment

Rủi ro thấp — script độc lập, không ảnh hưởng runtime app chính. Rủi ro seed password hardcode `admin12345` bị hiểu nhầm là an toàn cho production đã giảm đáng kể nhờ production guard ở bước 1 — nhưng vẫn cần ghi rõ trong doc (Phase 7) đây là dev-only.

## Security Considerations

Seed password là plaintext trong source code — CHỈ chấp nhận được vì đây là seed data cho môi trường dev/skeleton, không phải production credential thật. Guard `NODE_ENV === 'production'` là lớp bảo vệ kỹ thuật đầu tiên (không chỉ dựa vào tài liệu cảnh báo), nhưng không phải tuyệt đối — người dùng vẫn có thể set `NODE_ENV` sai. Không dùng seed script này để tạo user trên môi trường production thật dưới bất kỳ hình thức nào.
