# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile for NestJS API (pnpm workspace)
#
# NOT wired to any specific deploy platform (Dokploy, K8s, etc.) — that's
# the concrete project's job once a deploy target is chosen. This only
# proves the image builds and runs `node dist/main.js` standalone.
#
# Written but not yet verified with a real `docker build`/`docker run` on
# this machine (port conflicts with other running containers) — run both
# before relying on this in a real deploy.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
WORKDIR /app

# ---------- Stage 1: deps (install all workspace deps for building) ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- Stage 2: build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
# src/generated/prisma is gitignored — must regenerate here, not copied in.
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build
# Produce a lean production dependency tree for the runner stage
RUN pnpm --filter api --prod deploy /deploy/api

# ---------- Stage 3: runner ----------
FROM node:20-alpine AS runner
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
CMD ["node", "dist/main.js"]
