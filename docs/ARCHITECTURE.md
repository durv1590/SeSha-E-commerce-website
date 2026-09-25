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

| #   | Decision                                                                                                          | Rationale                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **pnpm workspaces**, no Turborepo/Nx                                                                              | Two apps and a few packages don't justify another tool; `pnpm -r` resolves build order. We can add Turbo later if CI time grows.                                                                  |
| 2   | **Browser → web origin → API** (`/api/*` rewrite in `next.config.ts`)                                             | Auth cookies stay first-party (`HttpOnly`, `SameSite=Lax`), and CORS stays closed to other origins. The API can still run on its own host and scale on its own.                                   |
| 3   | **Standard response envelope**: `{ data, meta? }` and `{ error: { code, message, details?, requestId } }`         | One predictable shape for every client. Error `code`s are stable and machine-readable. Messages are safe to show to customers.                                                                    |
| 4   | **No internals in errors**                                                                                        | `AllExceptionsFilter` logs stack traces server-side against a request id. The client only sees a generic message plus the `requestId` for support.                                                |
| 5   | **Money as integer paise**                                                                                        | Avoids floating-point rounding in prices, tax and coupon maths.                                                                                                                                   |
| 6   | **Zod for validation on both sides** (instead of class-validator)                                                 | Schemas are shared with the web app. There is one source of truth and the types are inferred.                                                                                                     |
| 7   | **Environment validated at boot** (`apps/api/src/config/env.ts`)                                                  | Misconfiguration fails fast at deploy time rather than surfacing as runtime bugs.                                                                                                                 |
| 8   | **Prisma schema lives in `apps/api`** (not `packages/database`)                                                   | Only the API talks to the database. Keeping Prisma there prevents the web app from bypassing API business rules. This deviates from the suggested `packages/database` on purpose.                 |
| 9   | **RBAC permissions defined in code** and enforced by API guards                                                   | Permissions are versioned, reviewed and testable. The web hides admin UI for convenience only, never for security.                                                                                |
| 10  | **Next.js `output: 'standalone'`** and multi-stage Docker images with non-root users                              | Small, reproducible images for any container host.                                                                                                                                                |
| 11  | **CSP allows `'unsafe-inline'` scripts**                                                                          | This is needed for Next.js bootstrap scripts without per-request nonces, which would disable static rendering and CDN caching. Every other directive is strict. We will revisit this in Phase 12. |
| 12  | **Design tokens in TypeScript, emitted as CSS variables by a Tailwind preset**                                    | One source of truth for web, and later for apps and email. Opacity modifiers (`bg-primary/40`) work, and no raw colours appear in components.                                                     |
| 13  | **Native `<dialog>` for modals and drawers; no UI library**                                                       | The browser provides the focus trap, inert background and top-layer stacking. This saves roughly 30 KB of JavaScript compared with headless-UI libraries.                                         |
| 14  | **Accent (orange) buttons use navy text**                                                                         | White on orange is 2.4:1 and fails WCAG AA. See BRAND_DESIGN_SYSTEM.md §3.                                                                                                                        |
| 15  | **`@seshakart/ui` ships TypeScript source** (`transpilePackages`), unlike the built `types`/`validation` packages | Only the Next.js app consumes it, so a build step would add nothing. The API never imports UI code.                                                                                               |

## Request lifecycle (API)

1. The `requestId` middleware assigns or propagates `X-Request-Id`.
2. Helmet applies security headers. The API serves JSON only, so its CSP is `default-src 'none'`.
3. CORS allows only the storefront origin and any configured extra origins.
4. (Phase 3+) Rate limiting, then authentication, then permission guards.
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
