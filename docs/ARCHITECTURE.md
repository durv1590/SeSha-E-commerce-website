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

| #   | Decision                                                                                                                               | Rationale                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **pnpm workspaces**, no Turborepo/Nx                                                                                                   | Two apps and a few packages don't justify another tool; `pnpm -r` resolves build order. We can add Turbo later if CI time grows.                                                                  |
| 2   | **Browser → web origin → API** (`/api/*` rewrite in `next.config.ts`)                                                                  | Auth cookies stay first-party (`HttpOnly`, `SameSite=Lax`), and CORS stays closed to other origins. The API can still run on its own host and scale on its own.                                   |
| 3   | **Standard response envelope**: `{ data, meta? }` and `{ error: { code, message, details?, requestId } }`                              | One predictable shape for every client. Error `code`s are stable and machine-readable. Messages are safe to show to customers.                                                                    |
| 4   | **No internals in errors**                                                                                                             | `AllExceptionsFilter` logs stack traces server-side against a request id. The client only sees a generic message plus the `requestId` for support.                                                |
| 5   | **Money as integer paise**                                                                                                             | Avoids floating-point rounding in prices, tax and coupon maths.                                                                                                                                   |
| 6   | **Zod for validation on both sides** (instead of class-validator)                                                                      | Schemas are shared with the web app. There is one source of truth and the types are inferred.                                                                                                     |
| 7   | **Environment validated at boot** (`apps/api/src/config/env.ts`)                                                                       | Misconfiguration fails fast at deploy time rather than surfacing as runtime bugs.                                                                                                                 |
| 8   | **Prisma schema lives in `apps/api`** (not `packages/database`)                                                                        | Only the API talks to the database. Keeping Prisma there prevents the web app from bypassing API business rules. This deviates from the suggested `packages/database` on purpose.                 |
| 9   | **RBAC permissions defined in code** and enforced by API guards                                                                        | Permissions are versioned, reviewed and testable. The web hides admin UI for convenience only, never for security.                                                                                |
| 10  | **Next.js `output: 'standalone'`** and multi-stage Docker images with non-root users                                                   | Small, reproducible images for any container host.                                                                                                                                                |
| 11  | **CSP allows `'unsafe-inline'` scripts**                                                                                               | This is needed for Next.js bootstrap scripts without per-request nonces, which would disable static rendering and CDN caching. Every other directive is strict. We will revisit this in Phase 12. |
| 12  | **Design tokens in TypeScript, emitted as CSS variables by a Tailwind preset**                                                         | One source of truth for web, and later for apps and email. Opacity modifiers (`bg-primary/40`) work, and no raw colours appear in components.                                                     |
| 13  | **Native `<dialog>` for modals and drawers; no UI library**                                                                            | The browser provides the focus trap, inert background and top-layer stacking. This saves roughly 30 KB of JavaScript compared with headless-UI libraries.                                         |
| 14  | **Accent (orange) buttons use navy text**                                                                                              | White on orange is 2.4:1 and fails WCAG AA. See BRAND_DESIGN_SYSTEM.md §3.                                                                                                                        |
| 15  | **`@seshakart/ui` ships TypeScript source** (`transpilePackages`), unlike the built `types`/`validation` packages                      | Only the Next.js app consumes it, so a build step would add nothing. The API never imports UI code.                                                                                               |
| 16  | **Database constraints as the last line of defence** (CHECKs for stock, prices and order totals)                                       | Money and stock rules hold even if application code has a bug or someone writes to the database directly.                                                                                         |
| 17  | **Redis optional locally, mandatory in production**                                                                                    | Contributors can run the API with only PostgreSQL. Production gets shared cache and rate limits across instances. Env validation enforces this at boot.                                           |
| 18  | **Cache failures degrade, never break**                                                                                                | If Redis is unavailable, `CacheService` falls through to the database and the throttler keeps working. Readiness reports `redis: down`.                                                           |
| 19  | **Settings in the database, validated by shared Zod schemas**                                                                          | Shipping fees, COD rules and store details are admin-editable without a deploy. A corrupt row falls back to defaults rather than breaking checkout.                                               |
| 20  | **Own auth, no third-party identity service**: argon2id, short JWT plus rotating refresh sessions, and OTP                             | Full control over Indian mobile-first flows (OTP), data residency and cost. The session store allows immediate revocation. Social login can be added later as another way to create a session.    |
| 21  | **Browsers never hold tokens in JavaScript** (HttpOnly cookies); native apps use Bearer tokens                                         | Limits the impact of XSS. The API serves both kinds of client from the same endpoints.                                                                                                            |
| 22  | **Production edge proxy routes `/api/*` directly to the API**                                                                          | Next.js rewrites don't forward client IPs. Per-IP rate limits and lockouts need the real address, and it also saves a hop. The rewrite stays as the development fallback.                         |
| 23  | **Refresh token scoped to `/api/auth`, plus a non-secret `sk_sess` marker**                                                            | The refresh token never reaches page routes. The marker lets middleware renew sessions through a redirect to the API.                                                                             |
| 24  | **Product aggregates maintained by database triggers** (minimum price, discount, available stock)                                      | Fast listing filters and sorts with no joins. Correct for every write path, including future checkout reservations, with no application code to forget.                                           |
| 25  | **Listing state lives in the URL** (`?brand=…&min=…&sort=…&page=…`) and pages are server-rendered                                      | Shareable, crawlable and back-button friendly. Filters work without JavaScript. Only the small filter and sort controls hydrate.                                                                  |
| 26  | **Two cache layers:** API Redis (60–300 s) plus the Next.js data cache (tag `catalog`)                                                 | Repeat views never hit PostgreSQL. Admin edits (Phase 10) invalidate the `catalog:` prefix and the `catalog` tag.                                                                                 |
| 27  | **Shop pages render per request** (`force-dynamic`), with cached data                                                                  | The header shows live admin-managed categories and settings, and nothing is baked in at build time, when the API is unreachable.                                                                  |
| 28  | **Media storage abstraction** (local driver now, S3 later); media is served at `/api/media` with immutable caching and a sandboxed CSP | The same URLs work behind a CDN. Keys are validated against path traversal.                                                                                                                       |

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
