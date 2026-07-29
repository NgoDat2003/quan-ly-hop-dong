---
title: 'Infra hardening: structured logging, graceful shutdown, .env.example'
description: >-
  Vá 3 khoảng trống hạ tầng của apps/api base template: .env.example thiếu,
  không graceful shutdown, log không structured
status: completed
priority: P2
branch: main
tags:
  - backend
  - infra
  - logging
blockedBy: []
blocks: []
created: '2026-07-29T02:24:04.471Z'
createdBy: 'ck:plan'
source: skill
---

# Infra hardening: structured logging, graceful shutdown, .env.example

## Overview

Từ brainstorm session ([reports/brainstorm-report.md](./reports/brainstorm-report.md)): base template `apps/api` thiếu 3 thứ hạ tầng nền tảng, rủi ro cao khi 1 dự án con deploy thật —
1. `.env.example` không tồn tại dù README tham chiếu.
2. Không có graceful shutdown — `PrismaService.onModuleDestroy` có sẵn nhưng Nest không gọi khi nhận `SIGTERM`.
3. Log chỉ là NestJS default `Logger` (text thô, không structured, không request-id).

Không đụng tới quyết định CI/CD/`compose.prod.yaml` đã chốt trước đó (giữ nguyên, không xét lại — xem `.agent/projectRules/base-template-conventions.md`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Env and shutdown baseline](./phase-01-env-and-shutdown-baseline.md) | Completed |
| 2 | [Structured logging with nestjs-pino](./phase-02-structured-logging-with-nestjs-pino.md) | Completed |
| 3 | [Docs sync](./phase-03-docs-sync.md) | Completed |

## Dependencies

Phase 2 phụ thuộc Phase 1 (cần `NODE_ENV` trong `env.schema.ts` trước khi `LoggerModule.forRootAsync` đọc nó). Phase 3 phụ thuộc cả 2 (docs sync ghi lại quyết định sau khi code đã ổn định).
