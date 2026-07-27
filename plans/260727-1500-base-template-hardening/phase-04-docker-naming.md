---
phase: 4
title: 'Docker Container Naming'
status: completed
priority: P3
effort: '10m'
dependencies: []
---

# Phase 4: Docker Container Naming

## Overview

`docker-compose.yml` hardcodes `container_name: training-app-postgres`. Since this repo is a clone-me base template, two clones running `docker compose up -d` simultaneously on the same dev machine would collide on that fixed container name. Drop the hardcoded name and let Compose derive one from the project directory (its default behavior), which is unique per clone as long as clones live in differently-named directories.

## Requirements

**Functional:** `docker compose up -d` still works exactly as before for a single clone; two clones in different directories no longer collide on container name.

**Non-functional:** no change to port mapping (`5433:5432`), volume, or healthcheck.

## Architecture

```
docker-compose.yml   # MODIFY — remove container_name line
```

## Related Code Files

**Modify:** `docker-compose.yml`.

## Implementation Steps

1. Remove the `container_name: training-app-postgres` line from the `postgres` service definition. Compose will name the container `{directory-name}-postgres-1` (or similar, per Compose's default naming) instead.

2. Verify: `docker compose down` (clean up the existing named container first, since changing this config doesn't rename a running container), then `docker compose up -d`, confirm Postgres still starts healthy and `apps/api` still connects successfully.

## Success Criteria

- [x] `container_name` line removed from `docker-compose.yml`.
- [x] `docker compose up -d` still produces a healthy Postgres container (auto-named `training-app-postgres-1`).
- [x] `pnpm --filter=api prisma:migrate` / a live api boot still connects successfully post-change (migration state and data persisted through the container recreation, verified via `prisma migrate status`).

## Risk Assessment

| #   | Risk                                                                                                                                                                         | Likelihood | Impact | Mitigation                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------- |
| R1  | Any script/doc elsewhere references the literal container name `training-app-postgres` (e.g. `docker logs training-app-postgres`, used during the original scaffold session) | Low        | Low    | Grep the repo for `training-app-postgres` before finalizing; update root README if it's referenced there |

**Rollback:** re-add the `container_name` line.
