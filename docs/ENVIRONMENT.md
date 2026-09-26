# Environment variables

Copy `.env.example` to `.env` **at the repository root** for local development. The API and the
Prisma CLI both read it. **Never commit `.env` files.**
In production, copy `.env.production.example` to `.env.production` on the server (`chmod 600`)
or use your hosting platform's secret manager; see [DEPLOYMENT.md](DEPLOYMENT.md).

The API validates its configuration at startup (`apps/api/src/config/env.ts`) and refuses
to boot if a value is missing or malformed.

Variables prefixed `NEXT_PUBLIC_` are embedded into browser JavaScript at build time. **Never
put a secret in a `NEXT_PUBLIC_` variable.**

## Web (`apps/web`)

| Variable                    | Required | Default                     | Description                                                                                                                                 |
| --------------------------- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`      | prod     | `https://www.seshakart.com` | Canonical public URL, used in metadata, sitemap and canonical links. Set at build time.                                                     |
| `API_INTERNAL_URL`          | yes      | `http://localhost:4000`     | Server-side URL of the API. It is never sent to browsers.                                                                                   |
| `CANONICAL_HOST`            | no       | `www.seshakart.com`         | In production, requests to the apex domain get a 308 redirect to this host. Only an https site on this host is indexable by search engines. |
| `ALLOW_INDEXING`            | no       | (on for the canonical host) | `false` closes the production site to search engines too (robots.txt, noindex). See SEO_ANALYTICS.md.                                       |
| `NEXT_PUBLIC_ANALYTICS_ID`  | no       | (off)                       | Google Analytics 4 measurement ID (`G-…`). Loads only after cookie consent. Build **and** runtime.                                          |
| `NEXT_PUBLIC_META_PIXEL_ID` | no       | (off)                       | Meta Pixel ID (digits). Loads only after marketing consent. Build **and** runtime.                                                          |
| `REVALIDATE_SECRET`         | prod     | –                           | Must equal the API's value; authorises cache refreshes after admin changes.                                                                 |
| `ENABLE_DESIGN_SYSTEM_PAGE` | no       | `false`                     | Serves `/design-system` in production builds (for staging). It must be set at build time.                                                   |

## API (`apps/api`)

| Variable                                                                  | Required       | Default                              | Description                                                                                                                                                                            |
| ------------------------------------------------------------------------- | -------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                | no             | `development`                        | `development`, `test` or `production`.                                                                                                                                                 |
| `API_PORT`                                                                | no             | `4000`                               | HTTP port.                                                                                                                                                                             |
| `APP_URL`                                                                 | prod           | `http://localhost:3000`              | Storefront origin, used for CORS and email links.                                                                                                                                      |
| `CORS_ORIGINS`                                                            | no             | (empty)                              | Extra comma-separated allowed origins.                                                                                                                                                 |
| `TRUST_PROXY_HOPS`                                                        | no             | `0`                                  | Proxies in front of the API that set `X-Forwarded-For`. **Production behind `infra/nginx`: `1`.** This is needed for per-IP rate limits. See SECURITY.md.                              |
| `LOG_LEVEL`                                                               | no             | `log`                                | `error`, `warn`, `log`, `debug` or `verbose`.                                                                                                                                          |
| `DATABASE_URL`                                                            | **yes**        | –                                    | PostgreSQL connection string. Add `?connection_limit=N` to size the pool.                                                                                                              |
| `DB_SLOW_QUERY_MS`                                                        | no             | `250`                                | Queries at or above this duration are logged (without parameters).                                                                                                                     |
| `REDIS_URL`                                                               | **prod**       | (none)                               | Shared cache and rate-limit store. Required in production; locally the app falls back to in-memory stores.                                                                             |
| `RATE_LIMIT_WINDOW_SECONDS`                                               | no             | `60`                                 | Global rate-limit window.                                                                                                                                                              |
| `RATE_LIMIT_MAX`                                                          | no             | `300`                                | Requests per window per client IP. Sensitive routes add stricter limits.                                                                                                               |
| `RATE_LIMIT_ENABLED`                                                      | no             | `true`                               | Only for automated tests. Production refuses `false`.                                                                                                                                  |
| `JWT_SECRET`                                                              | **yes**        | –                                    | Signs access tokens (HS256). At least 32 random characters, and different from `SESSION_SECRET`.                                                                                       |
| `SESSION_SECRET`                                                          | **yes**        | –                                    | HMAC key for stored refresh-token and OTP hashes. At least 32 random characters.                                                                                                       |
| `ACCESS_TOKEN_TTL_MINUTES`                                                | no             | `15`                                 | Access-token lifetime (1–60).                                                                                                                                                          |
| `REFRESH_TOKEN_TTL_DAYS`                                                  | no             | `30`                                 | Session lifetime without activity (1–90).                                                                                                                                              |
| `COOKIE_DOMAIN`                                                           | no             | (host-only)                          | Only set this to share sessions across subdomains.                                                                                                                                     |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | **prod**       | – / 587 / false                      | Any SMTP provider (SES, SendGrid, Zoho…). Without a host, emails are logged (development).                                                                                             |
| `MAIL_FROM`                                                               | no             | `SeShaKart <no-reply@seshakart.com>` | Sender address. It must be authorised (SPF, DKIM, DMARC) at the provider.                                                                                                              |
| `SMS_PROVIDER`                                                            | **prod**       | `console`                            | `console` prints SMS to the log (development). `none` disables mobile codes. Production rejects `console`. A DLT-registered gateway adapter is added before launch.                    |
| `MEDIA_DRIVER`                                                            | no             | `local`                              | Media storage. `local` stores files on disk and serves them at `/api/media`, which suits a single server with a persistent volume. An S3-compatible driver arrives with admin uploads. |
| `MEDIA_LOCAL_DIR`                                                         | no             | `uploads`                            | Local media directory, absolute or relative to `apps/api`. In Docker it is the `media` volume.                                                                                         |
| `MEDIA_PUBLIC_BASE`                                                       | no             | `/api/media`                         | Public URL prefix for media. Set it to a CDN origin (e.g. `https://cdn.seshakart.com`) in front of the media route.                                                                    |
| `PAYMENT_PROVIDER`                                                        | **prod**       | `mock`                               | `razorpay` or `mock`. The mock simulates payments for development and tests; production rejects it.                                                                                    |
| `PAYMENT_KEY_ID`                                                          | gateway        | –                                    | Razorpay key id (`rzp_test_…` / `rzp_live_…`). The only payment value that reaches browsers.                                                                                           |
| `PAYMENT_KEY_SECRET`                                                      | gateway        | –                                    | Razorpay key secret: API calls and checkout signature checks. **Server-side only.**                                                                                                    |
| `PAYMENT_WEBHOOK_SECRET`                                                  | gateway        | –                                    | The secret set on the Razorpay webhook; verifies every webhook. **Server-side only.**                                                                                                  |
| `PAYMENT_API_BASE`                                                        | no             | `https://api.razorpay.com`           | Gateway API base URL override (sandboxes, tests).                                                                                                                                      |
| `WEB_INTERNAL_URL`                                                        | **prod**       | –                                    | Storefront URL on the private network (e.g. `http://web:3000`). After admin changes the API calls its `/internal/revalidate` so shoppers see them at once.                             |
| `REVALIDATE_SECRET`                                                       | with the above | –                                    | Shared secret for `/internal/revalidate` (32+ random characters). Set the **same value** on the web app.                                                                               |
| `ALLOW_DEMO_SEED`                                                         | no             | –                                    | `true` lets `pnpm db:seed:demo` run with `NODE_ENV=production`. Use it on **staging only**.                                                                                            |
| `SEED_ADMIN_EMAIL`                                                        | seed           | –                                    | Email of the first SUPER_ADMIN created by `pnpm db:seed`.                                                                                                                              |
| `SEED_ADMIN_PASSWORD`                                                     | seed           | –                                    | Its initial password (8+ chars with a letter and a number; use a long random value). It is never overwritten on later seeds.                                                           |

### Deployment (Docker Compose)

Read by `infra/docker-compose.yml` from `.env.production`, not by the apps.

| Variable                                              | Default                                       | Description                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `seshakart` / **required** / `seshakart`      | Database credentials; the Compose file builds the API's `DATABASE_URL` from them.                                                  |
| `CLOUDFLARE_TUNNEL_TOKEN`                             | –                                             | Token of the Cloudflare Tunnel (profile `tunnel`). Required when that profile is enabled.                                          |
| `EDGE_BIND`                                           | `127.0.0.1`                                   | Address nginx publishes port 80 on. Keep the default with a tunnel; `0.0.0.0` only behind a firewall that admits Cloudflare alone. |
| `SESHAKART_API_IMAGE` / `SESHAKART_WEB_IMAGE`         | `seshakart-api:local` / `seshakart-web:local` | Images to run, e.g. released tags from GitHub Container Registry.                                                                  |

### Tests and tooling

End-to-end variables (`E2E_*`) are listed in [TESTING.md](TESTING.md#end-to-end-tests).
`NEXT_DIST_DIR` builds the storefront into another folder than `.next` (the e2e run uses
`.next-e2e`); leave it unset otherwise.

| Variable              | Default                                                          | Description                                         |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `TEST_DATABASE_URL`   | `postgresql://seshakart:seshakart@localhost:5432/seshakart_test` | Integration-test database. It must contain `_test`. |
| `TEST_REDIS_URL`      | (unset: Redis tests skipped)                                     | For example `redis://localhost:6379/15`.            |
| `SHADOW_DATABASE_URL` | –                                                                | Scratch database used by `pnpm db:check`.           |

## Planned (added with their phases)

`S3_*`, `MEDIA_BASE_URL`.
Each will be documented here, with its validation rules, when its module is implemented.

## Store and shipping settings (admin-editable)

These live in the `settings` table, not the environment, and are edited in **Admin → Settings**:

- `store.registeredState` and `store.gstin`: the GST registration. Deliveries within that state
  are invoiced with CGST + SGST, others with IGST; without a state, invoices use IGST, and without a
  GSTIN they say "Invoice" instead of "Tax Invoice". **Set both before launch.**
- `shipping`: delivery day ranges (standard 3–6, express 1–3 business days), remote PIN prefixes
  (+2 days, no express), blocked PIN prefixes and COD-blocked prefixes.

## Setting up Razorpay

1. In the Razorpay dashboard, create API keys (test mode first) and set `PAYMENT_PROVIDER=razorpay`,
   `PAYMENT_KEY_ID` and `PAYMENT_KEY_SECRET`.
2. Add a webhook pointing to `https://www.seshakart.com/api/webhooks/payments/razorpay` with a
   strong secret (`PAYMENT_WEBHOOK_SECRET`) and these events: `payment.captured`, `payment.failed`,
   `order.paid`, `refund.processed`, `refund.failed`.
3. Keep the secrets in the platform's secret manager. They never go in `.env.example`, the
   repository or any `NEXT_PUBLIC_*` variable.
