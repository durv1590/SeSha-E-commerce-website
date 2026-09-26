# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f infra/docker/web.Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are compiled into the browser bundle and the security headers,
# so they are build arguments. Leave the tracker IDs empty to build without analytics.
ARG NEXT_PUBLIC_SITE_URL=https://www.seshakart.com
ARG NEXT_PUBLIC_ANALYTICS_ID=
ARG NEXT_PUBLIC_META_PIXEL_ID=
# The /api rewrite (a fallback: nginx normally routes /api straight to the API) is fixed at
# build time too; inside the compose network the API is http://api:4000.
ARG API_INTERNAL_URL=http://api:4000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_ANALYTICS_ID=$NEXT_PUBLIC_ANALYTICS_ID \
    NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID \
    API_INTERNAL_URL=$API_INTERNAL_URL
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build:packages && pnpm --filter @seshakart/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
# Next.js standalone output contains a minimal server plus traced dependencies.
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
# robots.txt needs no API call, so a slow API can't mark the web container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/robots.txt >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
