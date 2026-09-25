# Environment variables

Copy `.env.example` to `.env` **at the repository root** for local development. The API and the
Prisma CLI both read it. **Never commit `.env` files.**
In production, set the variables in your hosting platform's secret manager.

The API validates its configuration at startup (`apps/api/src/config/env.ts`) and refuses
to boot if a value is missing or malformed.

Variables prefixed `NEXT_PUBLIC_` are embedded into browser JavaScript at build time. **Never
put a secret in a `NEXT_PUBLIC_` variable.**

## Web (`apps/web`)

| Variable                    | Required | Default                     | Description                                                                               |
| --------------------------- | -------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`      | prod     | `https://www.seshakart.com` | Canonical public URL, used in metadata, sitemap and canonical links.                      |
| `API_INTERNAL_URL`          | yes      | `http://localhost:4000`     | Server-side URL of the API. It is never sent to browsers.                                 |
| `CANONICAL_HOST`            | no       | `www.seshakart.com`         | In production, requests to the apex domain get a 308 redirect to this host.               |
| `ENABLE_DESIGN_SYSTEM_PAGE` | no       | `false`                     | Serves `/design-system` in production builds (for staging). It must be set at build time. |

## API (`apps/api`)

| Variable                    | Required | Default                 | Description                                                                                                                  |
| --------------------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | no       | `development`           | `development`, `test` or `production`.                                                                                       |
| `API_PORT`                  | no       | `4000`                  | HTTP port.                                                                                                                   |
| `APP_URL`                   | prod     | `http://localhost:3000` | Storefront origin, used for CORS and email links.                                                                            |
| `CORS_ORIGINS`              | no       | (empty)                 | Extra comma-separated allowed origins.                                                                                       |
| `TRUST_PROXY_HOPS`          | no       | `0`                     | Number of proxies in front of the API, so client IPs used for rate limiting are correct.                                     |
| `LOG_LEVEL`                 | no       | `log`                   | `error`, `warn`, `log`, `debug` or `verbose`.                                                                                |
| `DATABASE_URL`              | **yes**  | –                       | PostgreSQL connection string. Add `?connection_limit=N` to size the pool.                                                    |
| `DB_SLOW_QUERY_MS`          | no       | `250`                   | Queries at or above this duration are logged (without parameters).                                                           |
| `REDIS_URL`                 | **prod** | (none)                  | Shared cache and rate-limit store. Required in production; locally the app falls back to in-memory stores.                   |
| `RATE_LIMIT_WINDOW_SECONDS` | no       | `60`                    | Global rate-limit window.                                                                                                    |
| `RATE_LIMIT_MAX`            | no       | `300`                   | Requests per window per client IP. Sensitive routes add stricter limits.                                                     |
| `SEED_ADMIN_EMAIL`          | seed     | –                       | Email of the first SUPER_ADMIN created by `pnpm db:seed`.                                                                    |
| `SEED_ADMIN_PASSWORD`       | seed     | –                       | Its initial password (8+ chars with a letter and a number; use a long random value). It is never overwritten on later seeds. |

### Tests and tooling

| Variable              | Default                                                          | Description                                         |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `TEST_DATABASE_URL`   | `postgresql://seshakart:seshakart@localhost:5432/seshakart_test` | Integration-test database. It must contain `_test`. |
| `TEST_REDIS_URL`      | (unset: Redis tests skipped)                                     | For example `redis://localhost:6379/15`.            |
| `SHADOW_DATABASE_URL` | –                                                                | Scratch database used by `pnpm db:check`.           |

## Planned (added with their phases)

`JWT_SECRET`, `SESSION_SECRET`, `PAYMENT_*`, `S3_*`,
`MEDIA_BASE_URL`, `SMTP_*`, `MAIL_FROM`, `NEXT_PUBLIC_ANALYTICS_ID`, `NEXT_PUBLIC_META_PIXEL_ID`.
Each will be documented here, with its validation rules, when its module is implemented.
