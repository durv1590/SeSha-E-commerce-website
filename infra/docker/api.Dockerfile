# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f infra/docker/api.Dockerfile .
FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build:packages && pnpm --filter @seshakart/api build
# Self-contained production bundle (dist + prisma schema/migrations + runtime deps).
RUN pnpm --filter @seshakart/api deploy --prod --legacy /out \
  && cd /out && node node_modules/prisma/build/index.js generate

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
# Database migrations are a separate release step (see docs/DEPLOYMENT.md):
#   docker compose run --rm api npm run migrate:production
CMD ["node", "dist/main.js"]
