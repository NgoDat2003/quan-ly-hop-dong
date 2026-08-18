# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile for NestJS API (pnpm workspace)
#
# NOT wired to any specific deploy platform (Dokploy, K8s, etc.) — that's
# the concrete project's job once a deploy target is chosen. This only
# proves the image builds and runs `node dist/main.js` standalone.
#
# node:22-alpine (not 20) — pnpm@11.2.2 (pinned via corepack below) requires
# Node >=22.13 to run; node:20-alpine failed at `pnpm install` with
# ERR_UNKNOWN_BUILTIN_MODULE (node:sqlite) the first time this Dockerfile
# was actually built. Verified with a real `docker build` + `docker run`.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
WORKDIR /app

# ---------- Stage 1: deps (install all workspace deps for building) ----------
FROM base AS deps
# argon2's native addon needs a build toolchain on musl (Alpine) when no
# prebuilt binary matches — node-gyp-build falls back to compiling from
# source without this. bcryptjs (the previous hasher) was pure-JS and never
# needed this; argon2 is the first native dependency in this repo.
RUN apk add --no-cache python3 make g++
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- Stage 2: build ----------
FROM base AS build
# `pnpm --prod deploy` below re-resolves its own dependency tree — it does
# NOT simply reuse the node_modules copied from `deps`, so this stage needs
# its own build toolchain for argon2's native addon, same reasoning as deps.
RUN apk add --no-cache python3 make g++
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
# src/generated/prisma is gitignored — must regenerate here, not copied in.
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build
# Produce a lean production dependency tree for the runner stage.
# --legacy: pnpm v10+ defaults to requiring inject-workspace-packages=true
# for `pnpm deploy`, which this workspace does not set — --legacy restores
# the old deploy behavior (resolve from registry, not symlink workspace
# packages), which is what this single-package deploy actually needs.
RUN pnpm --filter api --prod deploy /deploy/api --legacy

# ---------- Stage 3: runner ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Non-root user
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

# App artefacts
COPY --from=build --chown=nestjs:nodejs /deploy/api/dist ./dist
COPY --from=build --chown=nestjs:nodejs /deploy/api/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /deploy/api/package.json ./package.json

USER nestjs
EXPOSE 3001
# nest build's outDir mirrors src/, so the entry point is dist/src/main.js,
# not dist/main.js — confirmed by inspecting the built image's dist/ layout.
CMD ["node", "dist/src/main.js"]
