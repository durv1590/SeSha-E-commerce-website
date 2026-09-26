# Deployment

How to run SeShaKart in production on a single server with Docker Compose, launch it, update
it, back it up and recover it. Variables are described in [ENVIRONMENT.md](ENVIRONMENT.md);
security background in [SECURITY.md](SECURITY.md).

## Architecture

```
 Shoppers ──HTTPS──▶ Cloudflare (TLS, CDN, WAF, DDoS)
                         │  Cloudflare Tunnel (outbound from the server, encrypted)
                         ▼
  ┌──────────── server (Docker Compose, infra/docker-compose.yml) ─────────────┐
  │ cloudflared ─▶ edge (nginx :80, localhost only)                             │
  │                   ├── /api/*  ─▶ api  (NestJS :4000) ──▶ postgres  (volume pgdata)   │
  │                   └── /*      ─▶ web  (Next.js :3000)    redis     (volume redisdata)│
  │                                   api media files       ──▶ volume media            │
  └──────────────────────────────────────────────────────────────────────────────┘
```

- **nginx** sends `/api/*` straight to the API with the visitor's IP (from `CF-Connecting-IP`),
  which the per-IP rate limits depend on. It is bound to `127.0.0.1`, so the only way in is the
  tunnel; trusting Cloudflare's IP header is therefore safe.
- **Nothing listens on the internet**: no open inbound ports except SSH, no TLS certificate to
  renew on the server.
- Media (product images) live on the `media` volume; PostgreSQL and Redis on their volumes.

**Without a tunnel** (Cloudflare proxy pointing at the server's IP): set `EDGE_BIND=0.0.0.0`,
allow port 80 only from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) in the
firewall, and prefer adding a Cloudflare origin certificate so the Cloudflare → server leg is
encrypted (this needs a `listen 443 ssl` block in `infra/nginx/seshakart.conf`).

## What you need

- A server: Ubuntu 24.04 LTS, **2 vCPU / 4 GB RAM minimum** (4 vCPU / 8 GB recommended),
  40 GB+ disk; Docker Engine with the Compose plugin; SSH with keys only; automatic security
  updates (`unattended-upgrades`).
- The domain on **Cloudflare**, with SSL/TLS set to **Full (strict)** and "Always Use HTTPS" on.
- An **SMTP provider** (Amazon SES, SendGrid, Zoho…) with SPF, DKIM and DMARC records for
  `seshakart.com`, or emails land in spam.
- A **Razorpay** live account (KYC done) with a webhook to
  `https://www.seshakart.com/api/webhooks/payments/razorpay` for the payment and refund events
  (see [ENVIRONMENT.md](ENVIRONMENT.md)).
- The business details for invoices: legal name, GSTIN, registered state and address.

## First deployment

All commands run from the repository on the server (e.g. `/srv/seshakart`) as the deploy user.
A shorthand keeps them readable:

```bash
alias dc='docker compose -f infra/docker-compose.yml --env-file .env.production --profile tunnel'
```

1. **Code and configuration**

   ```bash
   git clone https://github.com/<owner>/SeSha-E-commerce-website.git /srv/seshakart
   cd /srv/seshakart
   cp .env.production.example .env.production && chmod 600 .env.production
   # fill in every <…>; generate each secret with the command at the top of the file
   ```

2. **Cloudflare Tunnel**: in Cloudflare Zero Trust → Networks → Tunnels, create a tunnel,
   copy its token into `CLOUDFLARE_TUNNEL_TOKEN`, and add public hostnames
   `www.seshakart.com` and `seshakart.com`, both to `http://edge:80`.

3. **Build** the images (the storefront build reads `NEXT_PUBLIC_*` from `.env.production`):

   ```bash
   dc build
   ```

   Or use released images (see [Releasing updates](#releasing-updates)).

4. **Database**: start the backing services, apply the migrations, seed the settings and the
   first super admin:

   ```bash
   dc up -d postgres redis
   dc run --rm api npm run migrate:production
   dc run --rm api node dist/database/seed.js
   ```

   The seed never overwrites an existing admin or settings, and **refuses to run in production
   without** `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Afterwards, delete
   `SEED_ADMIN_PASSWORD` from `.env.production`. Never run the demo catalogue seed in
   production (it is refused unless `ALLOW_DEMO_SEED=true`).

5. **Start** everything and check it:

   ```bash
   dc up -d
   dc ps                                   # all services "healthy"
   EXPECT_INDEXING=0 infra/scripts/smoke.sh https://www.seshakart.com
   ```

6. **Backups**: schedule them now, before any real data exists (see [Backups](#backups)).

## Before launch: set up the store

Sign in at `https://www.seshakart.com/admin` with the seeded admin, then:

- [ ] Change the admin password; invite staff with the lowest role that fits (Staff).
- [ ] **Settings → Store**: legal name, **GSTIN**, **registered state**, address, support email
      and phone (invoices and the security contact use these).
- [ ] **Settings → Checkout and Delivery**: free-delivery threshold, fees, cash on delivery,
      delivery times, serviceable and excluded areas.
- [ ] **Content → Pages**: review the six draft pages with a legal adviser (the privacy policy
      must describe cookies and any analytics you enable), then publish them.
- [ ] Catalogue: categories, brands, products with real images and alt text, stock; banners
      and homepage rails.
- [ ] Place a **real** order with a small Razorpay payment, then refund it; place a
      cash-on-delivery order and take it through dispatch, delivery and a return
      ([ADMIN_GUIDE.md](ADMIN_GUIDE.md)).
- [ ] Check email delivery (order confirmation, password reset) including the spam folder.
- [ ] Optional analytics: create GA4 / Meta Pixel as in [SEO_ANALYTICS.md](SEO_ANALYTICS.md),
      set the IDs, rebuild the web image.
- [ ] Take a backup and do the **restore drill** once on a scratch server.

## Launch day

1. Remove `ALLOW_INDEXING=false` from `.env.production` and restart the storefront (it is read
   at runtime): `dc up -d web`.
2. `infra/scripts/smoke.sh https://www.seshakart.com` → all checks pass, including "robots.txt
   open to crawlers" and "sitemap lists pages".
3. Submit `https://www.seshakart.com/sitemap.xml` in Google Search Console and Bing Webmaster
   Tools.
4. Watch the logs and the order queue for the first hours (`dc logs -f api`).

## Releasing updates

Migrations are applied **before** the new code starts and are written to be backwards
compatible (add columns and tables first; remove old ones in a later release), so the
running version keeps working while they apply.

**Build on the server:**

```bash
git fetch --tags && git checkout v1.3.0
dc build
infra/scripts/backup.sh               # a fresh backup before every release
dc run --rm api npm run migrate:production
dc up -d                              # recreates only the changed containers
infra/scripts/smoke.sh https://www.seshakart.com
```

**Or use released images:** pushing a tag (`git tag v1.3.0 && git push origin v1.3.0`) builds
and publishes both images to GitHub Container Registry (`.github/workflows/release.yml`; set
the `NEXT_PUBLIC_*` values as repository variables). On the server set, in `.env.production`,

```bash
SESHAKART_API_IMAGE=ghcr.io/<owner>/sesha-e-commerce-website-api:v1.3.0
SESHAKART_WEB_IMAGE=ghcr.io/<owner>/sesha-e-commerce-website-web:v1.3.0
```

then `dc pull`, back up, migrate, `dc up -d` and run the smoke test as above.

Containers restart in a few seconds; open requests finish first (30 s grace period).

## Rolling back

- **Code:** redeploy the previous tag (`git checkout v1.2.0 && dc build && dc up -d`, or set the
  previous image tags and `dc up -d`). Because migrations are backwards compatible, the previous
  version runs on the newer schema.
- **Data:** only if a release damaged data, restore the backup taken before it. This loses
  every order and change made since that backup, so it is the last resort:
  `infra/scripts/restore.sh --confirm-overwrite <db-backup.dump> [<media-backup.tar.gz>]`.
  If the code you then run is newer than the backup, run the migrations again.

## Backups

`infra/scripts/backup.sh` writes a PostgreSQL dump (checked after writing) and an archive of the
uploaded media, readable by its owner only, and deletes its own backups older than 14 days.

```bash
# crontab -e (deploy user): every night at 02:15 (server time)
15 2 * * * cd /srv/seshakart && BACKUP_UPLOAD_CMD='rclone copy /var/backups/seshakart remote:seshakart-backups' infra/scripts/backup.sh >> /var/log/seshakart-backup.log 2>&1
```

- **Copy backups off the server** (`BACKUP_UPLOAD_CMD`, e.g. rclone to S3, Backblaze B2 or
  Google Drive). A backup on the same disk doesn't survive losing the server.
- Backups contain personal data: keep the off-site copy private and encrypted.
- Up to a day of orders can be lost with nightly backups; run the script hourly if that is too
  much.

### Restore drill

Once before launch and then quarterly, on a scratch server (never production): deploy the same
version, copy a backup there, run `infra/scripts/restore.sh --confirm-overwrite …`, then check
that orders, customers and product images are there. Note how long it took.

## Monitoring

- **Uptime:** an external monitor (e.g. UptimeRobot, Better Stack) on
  `https://www.seshakart.com/api/health/ready` (database and Redis) and on the home page, alerting
  by email or SMS. `/api/health` is liveness only.
- **Containers:** `dc ps` (health), `dc logs -f api web` (logs rotate at 5 × 20 MB per service).
  The API logs every error with a request id (customers can quote it) and every query slower
  than `DB_SLOW_QUERY_MS`.
- **Disk:** alert at 80 % (database, media and backups all grow).
- **Cloudflare:** traffic, 5xx rate and WAF events in the dashboard; add a rate-limiting rule
  for `/api/auth/*`.
- **Business:** the admin bell and dashboard show orders to ship, returns, manual refunds and
  low stock.
- Error tracking (e.g. Sentry) is not integrated yet; it is the next step if errors need
  alerting rather than log reading.

## Security operations

- Keep `.env.production` at `chmod 600`; never paste it into chats or tickets.
- **Rotate** a leaked or departing-staff-known secret: `JWT_SECRET` / `SESSION_SECRET` (signs
  everyone out), `REVALIDATE_SECRET`, SMTP and Razorpay keys (in their dashboards first). Then
  `dc up -d`.
- Patch the OS monthly; update Docker base images with each release (`dc build --pull`).
- Run `pnpm audit` before each release; review staff accounts and the audit log monthly.

## Staging

Use the same compose file on a separate server with `NEXT_PUBLIC_SITE_URL` and `CANONICAL_HOST`
set to the staging host. Staging is never indexable (only the canonical production host is),
may use Razorpay **test** keys, and may load the demo catalogue with `ALLOW_DEMO_SEED=true`.

## Troubleshooting

| Symptom                                   | Check                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| API container restarts                    | `dc logs api`: the first lines list every invalid or missing setting                      |
| 502 / "SeShaKart is taking a short break" | `dc ps`; the API or database is down or unhealthy                                         |
| Admin changes don't show on the store     | `WEB_INTERNAL_URL` and the same `REVALIDATE_SECRET` in both apps                          |
| Online payments stay "pending"            | Razorpay webhook URL and `PAYMENT_WEBHOOK_SECRET`; `dc logs api` for signature errors     |
| Emails missing                            | SMTP credentials; SPF/DKIM/DMARC; the provider's sending logs                             |
| Everyone shares one rate limit (429s)     | Traffic must reach the API through nginx (`TRUST_PROXY_HOPS=1`)                           |
| robots.txt still blocks crawlers          | `ALLOW_INDEXING` removed? The web image built with the production `NEXT_PUBLIC_SITE_URL`? |

## Current limitations

- **Mobile one-time codes are off** (`SMS_PROVIDER=none`) until a DLT-registered SMS gateway
  adapter is added; customers use email and password or an email code.
- **Single server:** media are on a local volume, so the API runs as one instance. Moving media
  to S3-compatible storage (planned) allows several API replicas; see
  [PERFORMANCE.md](PERFORMANCE.md#scaling).
- Deploys restart containers (seconds of unavailability); zero-downtime needs two replicas
  behind nginx.
