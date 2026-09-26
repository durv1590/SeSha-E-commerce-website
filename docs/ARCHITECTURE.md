# SeShaKart architecture

## System overview

```
            Browser / PWA                     Future Android & iOS apps
                  │                                        │
          HTTPS (Cloudflare edge, CDN)                    │
                  │                                        │
        ┌─────────▼──────────┐   /api/* rewrite   ┌────────▼─────────┐
        │  apps/web (Next.js) ├───────────────────►  apps/api (NestJS) │
        │  SSR / RSC / static │   server-to-server │  REST /api/*       │
        └─────────────────────┘                    └──┬──────┬──────┬───┘
                                                      │      │      │
                                               PostgreSQL  Redis   S3 + CDN
                                               (Prisma)   (cache, (product media)
                                                          rate limits)
                                                      │
                               Payment gateways · logistics · email/SMS (adapters)
```

- **apps/web** renders the storefront and the admin UI. It holds **no business rules**:
  pricing, stock, coupons and permissions are decided by the API. Server Components fetch
  data server-side. Client Components are used only where interaction needs them.
- **apps/api** is the single source of truth, exposed as a versionable REST API under `/api`.
  It is UI-agnostic, so mobile apps use the same endpoints.
- **packages/types** is the shared API contract, so web, API and future clients agree on shapes at compile time.
- **packages/ui** is the design system. `tokens.ts` is the single source of truth for colours, type,
  spacing, radii, shadows, motion and z-index. It feeds a Tailwind preset that emits CSS variables
  plus accessible React components. Next.js compiles it from source (`transpilePackages`).
- **packages/validation** holds Zod schemas used by web forms (instant feedback) and the API
  (the authoritative check). They are written once and never drift apart.

## Key decisions

| #   | Decision                                                                                                                                                                        | Rationale                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **pnpm workspaces**, no Turborepo/Nx                                                                                                                                            | Two apps and a few packages don't justify another tool; `pnpm -r` resolves build order. We can add Turbo later if CI time grows.                                                                                                             |
| 2   | **Browser → web origin → API** (`/api/*` rewrite in `next.config.ts`)                                                                                                           | Auth cookies stay first-party (`HttpOnly`, `SameSite=Lax`), and CORS stays closed to other origins. The API can still run on its own host and scale on its own.                                                                              |
| 3   | **Standard response envelope**: `{ data, meta? }` and `{ error: { code, message, details?, requestId } }`                                                                       | One predictable shape for every client. Error `code`s are stable and machine-readable. Messages are safe to show to customers.                                                                                                               |
| 4   | **No internals in errors**                                                                                                                                                      | `AllExceptionsFilter` logs stack traces server-side against a request id. The client only sees a generic message plus the `requestId` for support.                                                                                           |
| 5   | **Money as integer paise**                                                                                                                                                      | Avoids floating-point rounding in prices, tax and coupon maths.                                                                                                                                                                              |
| 6   | **Zod for validation on both sides** (instead of class-validator)                                                                                                               | Schemas are shared with the web app. There is one source of truth and the types are inferred.                                                                                                                                                |
| 7   | **Environment validated at boot** (`apps/api/src/config/env.ts`)                                                                                                                | Misconfiguration fails fast at deploy time rather than surfacing as runtime bugs.                                                                                                                                                            |
| 8   | **Prisma schema lives in `apps/api`** (not `packages/database`)                                                                                                                 | Only the API talks to the database. Keeping Prisma there prevents the web app from bypassing API business rules. This deviates from the suggested `packages/database` on purpose.                                                            |
| 9   | **RBAC permissions defined in code** and enforced by API guards                                                                                                                 | Permissions are versioned, reviewed and testable. The web hides admin UI for convenience only, never for security.                                                                                                                           |
| 10  | **Next.js `output: 'standalone'`** and multi-stage Docker images with non-root users                                                                                            | Small, reproducible images for any container host.                                                                                                                                                                                           |
| 11  | **CSP allows `'unsafe-inline'` scripts**                                                                                                                                        | This is needed for Next.js bootstrap scripts without per-request nonces, which would disable static rendering and CDN caching. Every other directive is strict. We will revisit this in Phase 12.                                            |
| 12  | **Design tokens in TypeScript, emitted as CSS variables by a Tailwind preset**                                                                                                  | One source of truth for web, and later for apps and email. Opacity modifiers (`bg-primary/40`) work, and no raw colours appear in components.                                                                                                |
| 13  | **Native `<dialog>` for modals and drawers; no UI library**                                                                                                                     | The browser provides the focus trap, inert background and top-layer stacking. This saves roughly 30 KB of JavaScript compared with headless-UI libraries.                                                                                    |
| 14  | **Accent (orange) buttons use navy text**                                                                                                                                       | White on orange is 2.4:1 and fails WCAG AA. See BRAND_DESIGN_SYSTEM.md §3.                                                                                                                                                                   |
| 15  | **`@seshakart/ui` ships TypeScript source** (`transpilePackages`), unlike the built `types`/`validation` packages                                                               | Only the Next.js app consumes it, so a build step would add nothing. The API never imports UI code.                                                                                                                                          |
| 16  | **Database constraints as the last line of defence** (CHECKs for stock, prices and order totals)                                                                                | Money and stock rules hold even if application code has a bug or someone writes to the database directly.                                                                                                                                    |
| 17  | **Redis optional locally, mandatory in production**                                                                                                                             | Contributors can run the API with only PostgreSQL. Production gets shared cache and rate limits across instances. Env validation enforces this at boot.                                                                                      |
| 18  | **Cache failures degrade, never break**                                                                                                                                         | If Redis is unavailable, `CacheService` falls through to the database and the throttler keeps working. Readiness reports `redis: down`.                                                                                                      |
| 19  | **Settings in the database, validated by shared Zod schemas**                                                                                                                   | Shipping fees, COD rules and store details are admin-editable without a deploy. A corrupt row falls back to defaults rather than breaking checkout.                                                                                          |
| 20  | **Own auth, no third-party identity service**: argon2id, short JWT plus rotating refresh sessions, and OTP                                                                      | Full control over Indian mobile-first flows (OTP), data residency and cost. The session store allows immediate revocation. Social login can be added later as another way to create a session.                                               |
| 21  | **Browsers never hold tokens in JavaScript** (HttpOnly cookies); native apps use Bearer tokens                                                                                  | Limits the impact of XSS. The API serves both kinds of client from the same endpoints.                                                                                                                                                       |
| 22  | **Production edge proxy routes `/api/*` directly to the API**                                                                                                                   | Next.js rewrites don't forward client IPs. Per-IP rate limits and lockouts need the real address, and it also saves a hop. The rewrite stays as the development fallback.                                                                    |
| 23  | **Refresh token scoped to `/api/auth`, plus a non-secret `sk_sess` marker**                                                                                                     | The refresh token never reaches page routes. The marker lets middleware renew sessions through a redirect to the API.                                                                                                                        |
| 24  | **Product aggregates maintained by database triggers** (minimum price, discount, available stock)                                                                               | Fast listing filters and sorts with no joins. Correct for every write path, including future checkout reservations, with no application code to forget.                                                                                      |
| 25  | **Listing state lives in the URL** (`?brand=…&min=…&sort=…&page=…`) and pages are server-rendered                                                                               | Shareable, crawlable and back-button friendly. Filters work without JavaScript. Only the small filter and sort controls hydrate.                                                                                                             |
| 26  | **Two cache layers:** API Redis (60–300 s) plus the Next.js data cache (tag `catalog`)                                                                                          | Repeat views never hit PostgreSQL. Admin edits invalidate the `catalog:` prefix and the `catalog` tag at once (decision 50).                                                                                                                 |
| 27  | **Shop pages render per request** (`force-dynamic`), with cached data                                                                                                           | The header shows live admin-managed categories and settings, and nothing is baked in at build time, when the API is unreachable.                                                                                                             |
| 28  | **Media storage abstraction** (local driver now, S3 later); media is served at `/api/media` with immutable caching and a sandboxed CSP                                          | The same URLs work behind a CDN. Keys are validated against path traversal.                                                                                                                                                                  |
| 29  | **Search in PostgreSQL** (full text + `pg_trgm`) behind a `SearchEngine` interface                                                                                              | No extra service to run or sync at launch, and results always match live stock and status. A dedicated engine or semantic search can implement the same interface later.                                                                     |
| 30  | **Search results are ranked ids, then the normal listing query**                                                                                                                | Filters, facets, pagination and card data are shared with every listing, so search results behave exactly like category pages.                                                                                                               |
| 31  | **Anonymous, aggregate search analytics**                                                                                                                                       | Popular searches and completions need counts, not identities. No user, session or IP is stored, and personal-looking queries are dropped.                                                                                                    |
| 32  | **Recent searches stay in the browser** (`localStorage`)                                                                                                                        | Useful for the shopper, and nothing personal is sent or stored server-side.                                                                                                                                                                  |
| 33  | **Pricing is a pure module** (`apps/api/src/cart/pricing.ts`)                                                                                                                   | Cart and checkout compute identical numbers; every coupon and tax rule is unit-tested without a database.                                                                                                                                    |
| 34  | **Prices are GST-inclusive; GST is reported, never added**                                                                                                                      | Indian retail convention (MRP includes tax). Tax is computed per line after its share of the coupon, ready for invoices.                                                                                                                     |
| 35  | **Guest carts use an opaque token cookie scoped to `/api`**, stored as an HMAC                                                                                                  | No account needed to shop; a database leak can't be replayed into a cart. The cart page therefore renders in the browser.                                                                                                                    |
| 36  | **Carts flag problems instead of silently changing them**                                                                                                                       | A price or stock change never alters what the shopper asked for without telling them; checkout is blocked until they choose.                                                                                                                 |
| 37  | **Wishlist is for signed-in customers only**                                                                                                                                    | The spec asks for server-side storage; guest hearts lead to sign-in and back.                                                                                                                                                                |
| 38  | **Payment gateway behind an interface**; Razorpay over plain REST, no SDK                                                                                                       | A second gateway is one more class. Plain `fetch` keeps secrets and timeouts under our control. A signing mock exercises the real verification and webhook code in development and tests.                                                    |
| 39  | **Stock is reserved at order time, sold at confirmation**                                                                                                                       | Conditional UPDATEs can't oversell under concurrency; unpaid orders release their hold automatically. COD confirms immediately.                                                                                                              |
| 40  | **Three independent paths settle a payment** (browser callback, webhook, sweeper)                                                                                               | Any one of them is enough, all are idempotent under a row lock, so a closed tab or a lost webhook never loses a paid order.                                                                                                                  |
| 41  | **The client sends the total it saw; the server refuses a different one**                                                                                                       | Prices can change between viewing and paying; the shopper confirms the new total instead of being charged silently.                                                                                                                          |
| 42  | **Gateway order created before the database transaction**                                                                                                                       | A slow gateway never holds stock locks; an unused gateway order is harmless.                                                                                                                                                                 |
| 43  | **Guest order access by a token bound to the guest's cart credential**                                                                                                          | Guests can see and pay for their order without an account; a leaked idempotency key alone can't retrieve it.                                                                                                                                 |
| 44  | **One order state machine**, checked on every customer and staff change                                                                                                         | Illegal jumps (e.g. shipped → cancelled) are impossible from any entry point; the table is unit-tested.                                                                                                                                      |
| 45  | **Logistics behind a provider interface**, manual provider first                                                                                                                | The store can ship on day one; Shiprocket/Delhivery/others slot in without touching order logic. Tracking links are never guessed.                                                                                                           |
| 46  | **Serviceability and ETAs from admin settings** (PIN prefixes, day ranges)                                                                                                      | Works without a courier API; the same rules drive the PIN checker, checkout and order estimates.                                                                                                                                             |
| 47  | **Invoice numbered at dispatch from a database sequence; PDF generated on demand**                                                                                              | GST time of supply is dispatch; sequential numbers per financial year; nothing to store or leak. Fonts ship with the API so ₹ always renders.                                                                                                |
| 48  | **COD cash becomes a payment record on delivery**                                                                                                                               | Returns and refunds work the same for COD and prepaid; COD refunds are manual with a reference.                                                                                                                                              |
| 49  | **Admin is part of the web app** (`/admin`, server-rendered, staff-only)                                                                                                        | One deployment, one design system and one API client. Customers get a 404 (not a redirect), and every API route re-checks permissions, so the UI never has to be trusted.                                                                    |
| 50  | **Admin edits refresh caches at once**: Redis prefixes cleared and the storefront's secret-protected `/internal/revalidate` called with tags (`catalog`, `settings`, `content`) | Shoppers see a price, banner or page change immediately instead of after the cache window. The endpoint is blocked at nginx and needs `REVALIDATE_SECRET`.                                                                                   |
| 51  | **Uploads are decoded, re-encoded to WebP and renamed**                                                                                                                         | The real format is checked by decoding (name and MIME are ignored), SVG is refused, EXIF/GPS is stripped, pixel bombs are capped, and keys are random, so no user-chosen name reaches storage.                                               |
| 52  | **Products saved as a whole, with optimistic concurrency**                                                                                                                      | Details, variants and images change together in one transaction; `expectedUpdatedAt` stops two editors silently overwriting each other. Ordered variants/products are deactivated or archived, never deleted, so order history stays intact. |
| 53  | **CSV import is validate-first and all-or-nothing**                                                                                                                             | A dry run reports every problem by line and column; applying runs in one transaction. Only columns present change; nothing is deleted. Exports neutralise spreadsheet formulas.                                                              |
| 54  | **CMS pages use restricted Markdown rendered to React elements**                                                                                                                | No HTML from the database ever reaches the page, so there is nothing to sanitise. Links are limited to site paths, https, mailto and tel.                                                                                                    |
| 55  | **Reviews only from customers who received the product; moderated**                                                                                                             | Every review is a verified purchase, which keeps ratings honest. Ratings are recomputed from approved reviews in the same transaction as moderation.                                                                                         |
| 56  | **Admin alerts are computed live from the work queues**                                                                                                                         | No fan-out of notification rows or stale counts; each staff member sees only what their permissions let them act on.                                                                                                                         |
| 57  | **Staff are invited without a password**                                                                                                                                        | The invitation asks them to set one via "Forgot password" (proving control of the mailbox). No credential is ever emailed; removing or suspending staff revokes their sessions.                                                              |
| 58  | **Reports by India-time day; refunds counted when paid**                                                                                                                        | Matches how the business and its accountant see the period; the April–March financial year is a preset.                                                                                                                                      |
| 59  | **Only the canonical https host is indexable**                                                                                                                                  | Staging and preview sites can be public without leaking into search results: they serve `Disallow: /`, an empty sitemap and `noindex`, decided from `NEXT_PUBLIC_SITE_URL` + `CANONICAL_HOST`, not from a flag someone must remember.        |
| 60  | **Sitemap from an API feed with the storefront's own visibility rules**                                                                                                         | Lists exactly what customers can reach (hidden ancestors, drafts and empty listings excluded); cached in Redis rather than Next's data cache, whose 2 MB item limit a large catalogue exceeds.                                               |
| 61  | **Filters canonicalise to the listing; pages keep their number**                                                                                                                | Faceted URLs don't compete with the listing, while products on page 2+ stay discoverable.                                                                                                                                                    |
| 62  | **Analytics load only after opt-in consent, per purpose**                                                                                                                       | DPDP Act 2023 practice: no tracker or cookie before a free, specific choice; reject is as easy as accept; withdrawal removes the tools' cookies.                                                                                             |
| 63  | **Events are built from product data, never personal data; URLs are cleaned**                                                                                                   | GA4 and Meta get slugs, amounts and cleaned page addresses only, so a token or order number in a URL can't leak to a third party.                                                                                                            |
| 64  | **Per-request nonce CSP with 'strict-dynamic', no 'unsafe-inline' scripts**                                                                                                     | Every page already rendered per request, so a nonce costs no caching; injected inline scripts and handlers are refused while Next.js, Razorpay and consented analytics keep working.                                                         |
| 65  | **Explicit 1 MB JSON limit; body-parser errors are 4xx**                                                                                                                        | The 100 KB default rejected legitimate content (a CMS page in an Indian script) and surfaced as a 500.                                                                                                                                       |
| 66  | **Typo vocabulary as a materialised view, refreshed lazily after catalogue changes**                                                                                            | Search cost no longer grows with the catalogue; a refresh marker under the catalogue cache prefix ties freshness to the existing invalidation.                                                                                               |
| 67  | **Optional in-process cache layer for small hot values (≤ 10 s, deep-frozen)**                                                                                                  | Parsing the category tree from Redis several times per request dominated API CPU; the bounded lag across instances is acceptable for taxonomy and settings.                                                                                  |
| 68  | **Performance decisions are measured on a synthetic 30k-product database**                                                                                                      | The demo catalogue hides scaling problems; the seed and load scripts live in tools/perf so results can be reproduced before launch.                                                                                                          |
| 69  | **Root 404 page kept light**                                                                                                                                                    | Next.js embeds the root not-found boundary in every page's payload; the full header there doubled the category tree on every page.                                                                                                           |
| 70  | **End-to-end tests create a new database per run and drop only that one**                                                                                                       | A harness that resets a named database can wipe real data if misconfigured; creating a uniquely named database (and dropping exactly it afterwards) makes that impossible and keeps runs independent.                                        |
| 71  | **The e2e storefront has its own production build (NEXT_DIST_DIR)**                                                                                                             | The browser's /api rewrite is fixed at build time; a separate build points it at the e2e API without touching the normal build.                                                                                                              |
| 72  | **E2E selectors are roles, labels and text**                                                                                                                                    | Tests find elements as users and assistive technology do, so a missing accessible name fails a test; axe runs on every key screen.                                                                                                           |
| 73  | **Single server with Docker Compose, reached through a Cloudflare Tunnel**                                                                                                      | Right-sized for launch traffic (see PERFORMANCE.md); no open web ports or origin certificates, and only Cloudflare can reach nginx, which makes trusting its client-IP header safe.                                                          |
| 74  | **Site URL indexing decision uses the build-time value**                                                                                                                        | `NEXT_PUBLIC_SITE_URL` is inlined into the client at build time; reading it at runtime could mark a site indexable whose pages carry another host's canonical links.                                                                         |
| 75  | **Backups are verified dumps plus media, restored only with an explicit flag**                                                                                                  | A dump is checked with `pg_restore --list` before it counts; restore overwrites everything, so it refuses to run without `--confirm-overwrite`.                                                                                              |
| 76  | **Versioned images built by CI on tags**                                                                                                                                        | Releases are reproducible and rollback is a tag change; building on the server stays possible for a first deployment.                                                                                                                        |

## Request lifecycle (API)

1. The `requestId` middleware assigns or propagates `X-Request-Id`.
2. Helmet applies security headers. The API serves JSON only, so its CSP is `default-src 'none'`.
3. CORS allows only the storefront origin and any configured extra origins.
4. Rate limiting per client IP (Redis-backed, atomic Lua counter; `/health` exempt), then
   authentication and permission guards (Phase 4).
5. The controller runs, and pipes validate input against the Zod schemas.
6. `EnvelopeInterceptor` wraps the result as `{ data }`. Errors pass through `AllExceptionsFilter`.

## Phase plan

Delivery follows the 14 phases listed in the [README](../README.md#roadmap). Each phase
inspects the existing code, implements only its own scope, runs lint, typecheck, test and build,
checks responsive behaviour, and records decisions here.

## Phase log

### Phase 1: architecture and repository setup ✅

- Monorepo with `apps/web`, `apps/api` and `packages/{types,validation,tsconfig,eslint-config}`.
- API foundation: boot-time env validation, response envelope, error filter, request ids,
  Helmet, CORS allow-list and a `/api/health` endpoint.
- Web foundation: Next.js 15 App Router, Tailwind, security headers,
  apex → `www` canonical redirect in production, `/api` rewrite to the API.
- Provisional logo (concept 01 "Smart S") cropped from the brand board. See `brand/README.md`.
- Tooling: shared TypeScript and ESLint configs, Prettier, Vitest (packages and web), Jest with SWC plus
  Supertest (API integration), GitHub Actions CI, and Dockerfiles with compose files.

### Phase 2: design system and brand implementation ✅

- `@seshakart/ui`: tokens, Tailwind preset (CSS variables), `cn()` with token-aware
  tailwind-merge, INR, discount and count formatters, and a WCAG contrast test for every token pairing.
- Components: Button (7 variants, 4 sizes, loading), Badges (discount, deal, new, bestseller, stock),
  Card, Price, Rating, form controls with ARIA wiring, QuantityStepper, Modal and Drawer
  (native dialog), Toast, Tooltip, DropdownMenu, Alert, EmptyState, Skeleton and Spinner.
- Web: Montserrat and Inter through `next/font`, global base styles, reduced-motion support,
  `Logo`, `BrandIcon`, `SectionHeading`, and ProductCard, CategoryCard, OfferCard and BrandCard.
- Brand assets: horizontal, stacked and reversed logos, app icons (dark, light, maskable), favicon.
- `/design-system` reference page (non-production), verified at 16 widths from 320 to 2560 px
  with no overflow, plus browser checks of dialog focus management, the toast live region,
  keyboard menus and target sizes.
- Bugs found and fixed during QA: star ratings filled each star with the same fraction; custom
  font-size classes dropped the button font weight; `₹499.5` is now formatted as `₹499.50`;
  link buttons were below the 24 px target size; product badges overlapped the wishlist button at 320 px.

### Phase 3: database and backend foundation ✅

- A Prisma schema covering 38 tables and 22 enums across identity, catalogue, inventory, cart,
  wishlist, orders, payments, refunds, webhooks, shipping, returns, coupons, reviews, Q&A, notifications
  and content, plus admin audit and settings.
- Two migrations: the generated schema plus hand-written SQL (27 CHECK constraints, partial unique
  indexes, full-text and trigram search indexes, and the order-number sequence). The drift check
  (`pnpm db:check`) runs in CI.
- NestJS infrastructure:
  - `PrismaService`, with slow-query logging.
  - `RedisService`, with graceful fallback and reconnect.
  - `CacheService`, with stampede protection and prefix invalidation.
  - Redis-backed rate limiting.
  - The Zod validation pipe (`@ZodBody`, `@ZodQuery`, `@ZodParam`), which strips unknown fields.
  - Mapping of database errors to safe API errors.
  - `AuditService` and `SettingsService`.
  - `/health` (liveness) and `/health/ready` (database and Redis readiness).
- Seed: default settings plus the first super admin (argon2id, idempotent).
- Tests (66 API tests):
  - The database constraints, including a concurrent-oversell race.
  - Validation, error mapping, rate limiting (in-memory and shared across two instances via Redis),
    the cache and the seed.
  - A shared-enum/schema parity test.
- Findings:
  - Nest guards don't run for unmatched routes, so floods against unknown URLs must be absorbed at the
    edge (Cloudflare rate limiting). This will be documented in SECURITY.md.
  - The default `pg_trgm` threshold misses short-word typos; search uses an explicit 0.5.

### Phase 4: authentication and customer system ✅

- **API auth:**
  - Register by email and/or mobile.
  - Password login with lockout, and passwordless one-time codes (email or SMS).
  - Rotating refresh sessions with reuse detection.
  - Logout and logout-everywhere, and password reset.
  - Contact verification.
  - Native-app mode (Bearer tokens).
  - Global `AuthGuard` enforcing `@Authenticated()` and `@RequirePermissions()` against the
    current role.
  - Double-submit CSRF.
  - Per-route rate limits.
  - Email (SMTP) and SMS provider abstraction with branded templates.
- **Customer account API:** profile, password change, active devices, addresses (Indian fields;
  default handling; limit of 20) and notifications. Every query is scoped by user id.
- **Web:**
  - API clients for server and browser, with CSRF handling and a single shared refresh.
  - Middleware protecting `/account`, `/checkout` and `/admin`, with transparent session renewal.
  - Site header (account menu, mobile drawer) and footer, both driven by admin settings.
  - Pages: `/login` (password or one-time code), `/register`, `/forgot-password`, and `/account`
    with overview, profile (with verification), addresses, security and notifications.
- **Tests:** 110 API tests (190 across the repository) pass, covering:
  - Enumeration resistance, lockout, OTP hashing, attempts and resend limits.
  - Refresh-token reuse detection, tampered and `alg: none` JWTs, native-app mode.
  - CSRF (including the app-header bypass attempt), RBAC, and admin-route permission coverage.
  - IDOR on addresses, sessions and notifications, and mass-assignment of role.
  - Open-redirect protection.
- **Browser QA:** 18 end-to-end checks and 9 pages × 16 widths with no overflow.
- **Bugs found and fixed:**
  - Refresh calls with an empty body failed validation.
  - Account pages overflowed horizontally on phones (grid track sized to the nav's content).
  - HTTPS-only headers broke client navigation on http builds, and the root `.env` was ignored
    by Next.js (cached env).
  - The build fetched from the API.
  - The footer showed a double full stop.
- **Security finding (documented, addressed through the edge proxy):** the `/api` rewrite hides
  client IPs.

### Phase 5: product catalogue ✅

- **Database:** trigger-maintained product aggregates (a new migration) with tests.
- **API:**
  - Category tree, breadcrumbs and subtrees (cached).
  - Brands.
  - Product listing with filters, sorts, stable pagination and facets that ignore their own filter.
  - Product detail with per-variant stock, and related products.
  - Admin-managed homepage: banners with date windows, sections by source, empty sections omitted.
  - Local media storage served at `/api/media`.
  - 16 new integration tests, including drafts and inactive categories being hidden, and
    media path-traversal attempts.
- **Demo catalogue:** a removable seed with 30 categories, 9 fictional brands and 39 products,
  with generated "DEMO IMAGE" artwork. It has no reviews or ratings and refuses production.
- **Web:**
  - Homepage (hero carousel with no autoplay, categories, promos, product rails, benefits, brands).
  - Desktop category menu (CSS only, keyboard accessible) and mobile category drawer.
  - `/categories`, `/category/[slug]`, `/brand/[slug]`, `/products`, `/deals`, `/new-arrivals` and
    `/best-sellers`, with a URL-driven filter sidebar or bottom sheet, sort, chips and pagination.
  - `/product/[slug]` with gallery (hover zoom and lightbox), a variant picker with shareable
    `?variant=`, pricing, specifications and policies.
  - 404 pages.
- **QA:** 20 browser interaction checks, and 10 pages × 16 widths with no overflow and CLS below
  0.1. Images are served as AVIF (a 7 KB WebP becomes 1.4 KB at card size).
- **Bugs found and fixed:**
  - The cached listing lost its response envelope.
  - A type-error build was emitted (`noEmitOnError` is now on).
  - Product options appeared in the wrong order (JSONB reorders keys).
  - Unavailable option combinations were shown as out of stock.
  - Hero slides had unequal heights.
  - The mega-menu widened the page at 1024 px.
  - The sort control overflowed at 320 px.
  - Pages were pre-rendered with an empty header at build time.
  - The production build failed when Google Fonts returned a response it couldn't parse. Fonts are
    now self-hosted, and a ₹-only subset face was added: the rupee sign had been rendering in a
    fallback font.

### Phase 6: search and filtering ✅

- **API:**
  - PostgreSQL search engine: normalisation, synonyms, brand detection, weighted prefix
    full-text search, typo correction from the catalogue vocabulary and a fuzzy fallback for
    unknown words. Ranking blends relevance, sales and stock.
  - `q` on the product listing (relevance sort, facets scoped to the results),
    `/search/suggest` and `/search/popular` (admin-curated trending plus popular real searches).
  - Anonymous search analytics that skip personal-looking queries.
  - 15 new integration tests (ranking, prefixes, synonyms, brands, typos, filters, injection
    attempts, analytics privacy, suggestions) and 5 unit tests.
- **Web:**
  - Header search as an ARIA 1.2 combobox: debounced suggestions with product thumbnails,
    categories, brands and completions; recent (browser-only), trending and popular searches
    when empty; full keyboard support. A plain GET form without JavaScript. In the main bar
    from 768 px, in its own row on phones.
  - `/search` results page on the shared listing (filters keep the query, relevance sort,
    "showing results for" notice), an empty state with popular searches and categories, and
    `noindex, follow`.
- **QA:** keyboard and screen-reader semantics checked, axe clean on the popup, results and empty
  pages, and 16 widths with no overflow.
- **Bugs found and fixed:**
  - Length-normalised ranking put a bare product above a better-described one (now
    `rank/(rank+1)`).
  - The fuzzy fallback returned partial matches for real words that never occur together.
  - The sticky sort bar slid under the taller phone header.

### Phase 7: cart and wishlist ✅

- **API:**
  - Guest carts (HttpOnly token cookie or `X-Cart-Token`, HMAC-stored) and customer carts,
    merged on sign-in, with stale guest carts purged.
  - Add, update, remove and save for later, validated against live variants, stock and the
    per-item limit; lines that change underneath the shopper are flagged and block checkout.
  - A pure pricing module: MRP savings, the coupon engine (percentage and fixed, product and
    category restrictions, first order, customer-specific, minimum value, cap, dates, total and
    per-customer limits), free-delivery threshold and included GST.
  - Server-side wishlist with live prices and move to cart.
  - 12 pricing unit tests and 19 integration tests (cart ownership, forged tokens, stock
    changes, CSRF with the cart cookie, app tokens, merging, coupons, wishlist privacy).
- **Web:**
  - Header cart and wishlist badges that stay in sync across tabs (BroadcastChannel) and
    refresh on focus and after signing in or out.
  - Add to cart from cards ("Choose options" for products with variants) and from the product
    page (quantity, Add to cart, Buy now, Wishlist).
  - `/cart`: lines with quantity, save for later, remove with undo, clear problem messages with
    one-click fixes, a coupon form, a free-delivery progress bar, price details with savings and
    GST, and a sticky total and checkout bar on phones.
  - `/account/wishlist` with move to cart; empty states for both.
- **QA:** end-to-end browser flows (card and product adds, cross-tab badge, coupons, save and
  undo, guest to account merge on registration, wishlist), axe clean on the product, cart and
  wishlist pages, and no overflow at 16 widths.
- **Bugs found and fixed:**
  - A new guest's first add returned an empty cart (the response was built before the new token
    existed).
  - The account sidebar and the footer were both a navigation landmark called "Account".
  - The cart's sign-in link was 4.47:1 contrast.

### Phase 8: checkout and payments ✅

- **API:**
  - Payment gateway interface; Razorpay (orders, checkout and webhook HMAC signatures, payment
    lookup, refunds) with timeouts and safe errors; a signing mock gateway, refused in
    production, and the environment requires all credentials for a real gateway.
  - Checkout quote: standard/express delivery, online/COD payment with COD eligibility (store
    switch, per-product flag, order limit) and fees.
  - Placing orders in one transaction: re-pricing with a changed-total guard, idempotency keys,
    atomic stock reservation, atomic coupon claims, line and address snapshots, cart clearing,
    status history; COD confirms immediately.
  - Payments settle from the browser callback, the signed and de-duplicated webhook, or the
    sweeper (reconciles with the gateway, cancels expired orders, releases stock and coupons);
    retry after failure; amount checks; automatic refund of late payments; partial and full
    refunds; order confirmation emails.
  - A migration for order idempotency keys; 20 integration tests (stock and coupon races,
    idempotency, forged signatures, webhook duplicates and wrong amounts, expiry,
    reconciliation, late payments, refunds, gateway outage, guest access) and 6 gateway tests,
    including a local HTTP server standing in for Razorpay.
- **Web:**
  - `/checkout` for guests and customers: contact, saved or new address (optionally saved),
    billing address, delivery speed, payment method with reasons when COD isn't available,
    delivery notes and a live summary; server field errors mapped onto fields.
  - Razorpay Checkout loaded on demand (CSP allows only its origins), and a clearly labelled
    test-payment dialog for the mock gateway.
  - `/checkout/success` (polls briefly while a payment is being confirmed) and `/checkout/failed`
    (retry while stock is held; clear cancellation message afterwards).
- **QA:** browser runs of guest COD, online payment failure then retry, cancelled payment, and a
  signed-in customer with a saved address, express delivery and COD (totals checked in the
  database); axe clean; no overflow at 16 widths.
- **Bugs found and fixed:**
  - A guest's order token could be derived from the idempotency key alone; it is now bound to
    the guest's cart credential.
  - The place-order button could be pressed while a new total was loading (the server refused
    it safely); it now waits for the quote.
  - The form-level error stayed after the shopper corrected the fields.
  - A description list on the confirmation page held a paragraph (invalid markup).
  - The concurrency test now accepts both correct refusals, depending on timing.

### Phase 9: orders and shipping ✅

- **API:**
  - Order state machine; customer order list and detail (timeline, delivery estimate,
    shipments, returns, refunds, allowed actions), cancellation until packed (release or restock,
    coupon returned, online payments refunded), returns and replacements per product return
    window, public tracking with order number plus email or mobile.
  - Staff fulfilment API (permission-gated, audit-logged): processing and packed, dispatch with
    carrier and tracking number, tracking events (delivery, failed attempt, returned to seller),
    cancellation, return processing with restock and refund, gateway and manual refunds.
  - Logistics provider interface with a manual provider; shipping settings for serviceability,
    COD and express by PIN code and delivery windows in business days; checkout enforces them.
  - GST invoices: numbered at dispatch (`SK/26-27/000123`), PDF with CGST/SGST or IGST, HSN,
    coupon shares, amount in words, embedded Inter fonts (with ₹) and the logo.
  - Refunds on orders still being fulfilled no longer change the order status; refund and
    status emails.
  - Migration for invoice numbers, shipped and resolved dates, and refund references; 15 unit tests
    (state machine, delivery estimates, invoice maths) and 14 integration tests.
- **Web:**
  - `/account/orders` with filters; `/account/orders/[orderNumber]` with the progress timeline,
    tracking, items, returns, refunds, price details, invoice download, and cancel and
    return/replace dialogs.
  - `/track-order` for everyone; a delivery checker (PIN code → dates and COD) on product pages;
    checkout re-prices by PIN code and falls back when COD or express isn't available.
  - Orders in the account menu, navigation, overview, footer and mobile menu.
- **QA:** browser runs of the PIN checker, a remote PIN at checkout, cancellation, dispatch,
  out for delivery, delivery, invoice download, a return request, the order list and public
  tracking (including wrong details); both invoice variants rendered and checked; axe clean;
  no overflow at 16 widths.
- **Bugs found and fixed:**
  - Checkout saved a typed address to the address book even when the order was then refused.
  - Reusing a courier tracking number gave a generic conflict; it now names the other order.
  - Out-for-delivery orders showed the original estimate instead of today.
  - Delivered orders with non-returnable items gave no explanation.
  - The delivery checker's button was 4.47:1 contrast on hover.

### Phase 10: admin dashboard ✅

Delivered in five milestones, each tested, browser-checked and committed separately.

- **10A Foundation:** staff-only admin shell (sidebar and mobile drawer, permission-aware
  navigation, customers get a 404), dashboard (KPIs with period comparison, accessible 30-day
  chart with a table view, work queues, recent orders, top products), safe image uploads, and
  storefront cache revalidation (API → `/internal/revalidate`).
- **10B Catalogue:** product list and editor (details, images with alt text and ordering,
  variants with prices and opening stock, specifications, shipping/returns, SEO preview,
  publish/unpublish/archive, duplicate, delete-if-never-ordered, optimistic concurrency),
  categories (three levels, subtree moves), brands, inventory (adjustments that never go below
  reserved, low-stock thresholds, stock history), CSV export and validated import.
- **10C Operations:** order queues, search, filters and CSV export; a staff order page with
  payments, refunds, history and every fulfilment action (status, dispatch with invoice,
  tracking, cancel, refunds including manual COD refunds, return decisions with restock) plus
  a staff invoice download; returns queue; customers with spend and suspension; coupons.
- **10D Content and settings:** banners (placements, schedule, images), homepage sections with
  ordering, CMS pages with preview rendered on the store at `/pages/<slug>` and in the footer,
  per-page SEO overrides applied to the main store pages, and settings forms (store and GST,
  checkout, delivery areas and times, search). Six policy pages are seeded as **drafts** for the
  business to review.
- **10E Engagement:** verified-purchase reviews (product page with breakdown and sorting, account
  page, moderation, rating aggregation), the "needs attention" bell, audit log viewer, staff
  management (invite, roles, suspend, remove) and sales reports (day/month, financial year,
  payment method, category, CSV).
- **Tests:** API 282 (44 new across the admin suites: catalogue, operations, content, engagement,
  plus CSV and rating unit tests), web 32, UI 47, validation 41. Browser QA of every admin screen
  at desktop and phone widths: axe clean, no horizontal overflow, keyboard-operable dialogs,
  and a role check (an inventory manager gets 404 on eight restricted pages and sees read-only
  controls).
- **Bugs found and fixed:**
  - The built API failed to start: `multer` was used but not declared (Jest resolved it
    transitively).
  - `text-wrap: pretty/balance` shorthands reset `text-wrap-mode` and broke inherited
    `white-space: nowrap` site-wide; the longhands are used now.
  - **Star ratings filled every star regardless of the value** (since Phase 5): the gradient was
    evaluated in each translated star's own coordinates. The fill is now a clip on an
    untransformed group, with structural tests; SVG ids are sanitised for `url(#…)`.
  - Visually hidden text inside scrollable admin tables widened phone layouts; the table region
    is now positioned.
  - Hidden file inputs lacked labels; duplicate `aside` landmarks; the first-error focus followed
    validator order instead of page order; low-contrast hints on selected cards; a paragraph
    inside a `dl`; a table and its section shared an accessible name.
  - The API accepted `javascript:` image URLs until the validation package was rebuilt; the
    schema limits them to uploads or https (tested).
  - Read-only staff were told "Nothing to do" on orders that did have actions for other roles.
  - The storefront account menu had no link to the admin for staff (added, with Reviews).

### Phase 11: SEO and analytics ✅

- **11A Sitemap and robots:** `GET /api/sitemap` feed; `/sitemap.xml` (static listings, live
  products with images, non-empty categories and brands, published pages, minus admin-hidden
  paths) and `/robots.txt`; non-canonical hosts are closed to crawlers.
- **11B Metadata and structured data:** one `pageMetadata()` helper gives every indexable page a
  canonical URL (paginated listings keep their page) and a complete Open Graph block with a
  default share image; X large-image card. JSON-LD: `OnlineStore` and `WebSite` search box on the
  home page, `Product` (offers in INR, availability, return policy, rating, reviews) and
  `BreadcrumbList` on product, category and CMS pages, safely escaped.
- **11C Analytics:** consent banner and footer "Cookie settings"; GA4 and Meta Pixel loaded only
  for the purposes accepted; page views on every client navigation with cleaned addresses;
  `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (once per order), `search`,
  `sign_up`, `login`; CSP origins only for configured tools; Docker build arguments for the IDs.
  Guide: [SEO_ANALYTICS.md](SEO_ANALYTICS.md).
- **Tests:** API +1 (sitemap visibility), web +26. Browser QA with stubbed tag endpoints:
  nothing loads before consent; reject, choose, accept and withdraw flows; events on a real COD
  order; no email or token in any payload; banner axe-clean at 1280 and 360 px.
- **Bugs found and fixed:** events fired while a page hydrated were dropped (now queued until
  consent is known); white-on-blue hero and offer text at 90 % opacity failed AA contrast.

### Phase 12: performance and security ✅

- **12A Security:** every `pnpm audit` advisory fixed (nodemailer 7 → 10, sharp 0.34 → 0.35.4,
  Vitest 3 → 4, overrides for postcss, sharp via Next.js and deepmerge-ts via Prisma);
  per-request nonce CSP without `'unsafe-inline'` scripts, browser-tested across storefront,
  checkout, consented analytics and admin with zero violations; explicit JSON body limit with
  4xx errors; `security.txt`; nginx `server_tokens off` and gzip.
- **12B Performance:** measured on a synthetic 30k-product / 100k-order database
  ([PERFORMANCE.md](PERFORMANCE.md), [tools/perf](../tools/perf/README.md)). Uncached mixed
  traffic 64 → 216 req/s per API process (p50 637 → 161 ms): materialised typo vocabulary,
  indexed fuzzy fallback, in-process cache layer for hot values (41 % of CPU was JSON parsing),
  covering facet index. Pages 20–45 % smaller (root 404 no longer duplicated the header in
  every page, slimmer mobile menu props, capped desktop sub-menus and brand filters). Mobile
  LCP 0.8–1.1 s and CLS ≈ 0 under a slow-4G / 4× CPU profile.
- **Tests:** API 288 (+5: body limits, vocabulary refresh, two cache-layer cases, also
  run against real Redis), web 61, UI 48, validation 41. `db:check` confirms schema and migrations agree.
- **Bugs found and fixed:**
  - A 50,000-character CMS page in an Indian script (~150 KB) was rejected by the 100 KB default
    body limit, and oversized bodies returned **500** instead of 413.
  - `pnpm db:check` silently ran without a shadow database: the shell expanded
    `$SHADOW_DATABASE_URL` before Node loaded `.env`.
  - sharp 0.35 no longer exposes its type namespace to ESM consumers (build break on upgrade).
  - The Phase 11 entry of this log had not been written (added above).
- **Known issues, for Phase 13:**
  - A `notFound()` raised inside a page (for example an unknown product) is rendered by the
    browser from the page payload (`<html id="__next_error__">`), not in the server HTML. The
    status is a correct 404 and the page works with JavaScript; unknown URLs outside any page
    are fully server-rendered. (Phase 13 traced this to Next.js 15.5 itself; see below.)
  - Home-page Total Blocking Time (~700 ms on the throttled phone profile) is mostly framework
    and card hydration; see PERFORMANCE.md.

### Phase 13: end-to-end testing ✅

- **13A Harness** (`apps/e2e`, [TESTING.md](TESTING.md)): Playwright against the built API, a
  production storefront build, PostgreSQL and Redis; desktop and phone projects. Each run creates
  a uniquely named database, migrates it with `migrate deploy`, seeds it, and drops only that
  database afterwards. The storefront gets its own build (`.next-e2e`) pointed at the e2e API.
- **13B Journeys:** guest search → cart → cash-on-delivery checkout → tracking; registered
  customer wishlist → online payment → cancellation with refund; staff dispatch with GST invoice →
  delivery → customer review → moderation → visible on the product page; return → restock →
  automatic refund → UTR recorded; access control; CSP nonce and injected-script refusal; SEO
  basics; 404s; axe (WCAG 2.2 AA) on storefront, cart, checkout and admin. **34 tests** (desktop and
  phone) in about 1–2 minutes including the build. A CI job runs them on every pull request and
  uploads traces on failure.
- **Bugs found and fixed:**
  - **Staff were told to refund manually after completing a return,** but completing it already
    starts the refund of the returned items; following the instruction would also have refunded
    the delivery/COD fee. The dialog and the admin guide now say what happens.
  - **In-text links relied on colour alone** (WCAG 1.4.1: 1.7:1 against the surrounding text, no
    underline), for example "Sign in to review" on product pages. Links in paragraphs are now
    underlined site-wide.
  - The product-not-found page had no `h1`.
  - Harness issues found while building it: the storefront's `/api` rewrite
    is fixed at build time (hence the separate e2e build), and Next's on-disk data cache kept the
    previous run's product ids (cleared on start).
- **Not a bug in SeShaKart:** the client-rendered not-found for `notFound()` inside a page (known
  issue from Phase 12) was reproduced in a minimal Next.js 15.5.26 app with no project code: a
  layout, a `not-found.tsx` and a page calling `notFound()` give the same `__next_error__` shell,
  while unmatched URLs are server-rendered. The 404 status is correct and an e2e test checks the
  page appears. Re-check when upgrading Next.js.
- **Harness safety:** Prisma refuses `migrate reset` when run by an AI agent without the user's
  consent. Rather than work around that guard, the harness was designed so it never needs a
  reset (see decision 70).

### Phase 14: production deployment preparation ✅

- **14A Hardening:** Compose services start in dependency order on health checks (PostgreSQL,
  Redis, API, storefront, nginx), stop gracefully (30 s), and rotate their logs; nginx listens on
  localhost only, with an optional Cloudflare Tunnel service so the server needs no open web
  ports; image names are configurable for released images; `.env.production.example` passes the
  API's production validation once filled in (and is rejected until then).
- **14B Operations:** `infra/scripts/backup.sh` (verified dump + media, retention, off-site copy
  hook), `restore.sh` (requires `--confirm-overwrite`), `smoke.sh` (read-only checks of health,
  CSP, headers, robots/sitemap, admin protection, 404s). Backup and restore were tested end to
  end, and the smoke test against a production-mode stack. A tag-triggered workflow publishes
  versioned API and storefront images to GitHub Container Registry.
- **14C Runbook:** [DEPLOYMENT.md](DEPLOYMENT.md): first deployment, pre-launch checklist,
  launch day, releases, rollback, backups and restore drill, monitoring, security operations,
  staging and troubleshooting.
- **Bugs found and fixed:**
  - The storefront Docker image baked the `/api` rewrite to the default `localhost:4000` (the
    rewrite is fixed at build time), so every browser API call would have failed in Compose. It
    now builds with `API_INTERNAL_URL=http://api:4000`, and its health check no longer needs the
    API.
  - A storefront server started without `NEXT_PUBLIC_SITE_URL` at runtime fell back to the
    production URL and became indexable with production canonical links (decision 74).
  - The environment template pointed the Razorpay webhook at a wrong path.
- **Verified without Docker** (not available in the build environment): the production API
  bundle (`pnpm deploy --prod`) migrates, seeds and serves in production mode, and the seed refuses
  to run without admin credentials; the standalone storefront layout serves pages. `docker
compose build` and `nginx -t` should be run once on the server before launch.
