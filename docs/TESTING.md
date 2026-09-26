# Testing

SeShaKart is tested at three levels. Everything below runs in CI (`.github/workflows/ci.yml`)
on every pull request and push to `main`.

| Level       | Tool             | Where                                            | What it covers                                                                                                                                  |
| ----------- | ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest           | `apps/web`, `packages/ui`, `packages/validation` | Pure logic (pricing, SEO helpers, consent, analytics mapping, CSP), UI components, shared schemas                                               |
| Integration | Jest + Supertest | `apps/api/test`, `apps/api/src/**/*.spec.ts`     | The real API on a real PostgreSQL and Redis: auth, RBAC, CSRF, catalogue, search, cart, checkout, payments, orders, returns, admin, rate limits |
| End-to-end  | Playwright       | `apps/e2e`                                       | The whole stack in a real browser, desktop and phone                                                                                            |

## Commands

```bash
pnpm test        # unit + integration (needs PostgreSQL; Redis tests run when TEST_REDIS_URL is set)
pnpm build       # the API must be built before end-to-end tests
pnpm test:e2e    # end-to-end (builds its own storefront; ~1–2 minutes)
pnpm db:check    # schema.prisma and the migrations agree
```

Useful end-to-end options (run from the repository root):

```bash
pnpm test:e2e --project=desktop specs/customer.spec.ts    # one file, one project
E2E_SKIP_BUILD=1 pnpm test:e2e                            # reuse the last e2e storefront build
pnpm --filter @seshakart/e2e e2e:ui                       # Playwright UI mode
pnpm --filter @seshakart/e2e e2e:report                   # open the last HTML report
```

## Integration tests (API)

They run against `TEST_DATABASE_URL` (its name must contain `_test`; the global setup applies
the migrations and each suite empties the tables it uses) with rate limiting and email/SMS
delivery replaced by in-memory fakes. Run them one file at a time with `--runInBand` if you
need to debug.

## End-to-end tests

### How a run works

1. **API** (`apps/e2e/support/start-api.mjs`): creates a **new database with a unique name**
   (`seshakart_e2e_<id>`) on the server `DATABASE_URL` points to, applies the migrations with
   `migrate deploy`, seeds the store settings, an e2e-only admin and the demo catalogue, empties
   its Redis DB (6) and starts the built API on port 4500 with the mock payment gateway.
   Nothing that already exists is ever reset or dropped.
2. **Storefront** (`support/start-web.mjs`): a production build in its own folder
   (`apps/web/.next-e2e`, via `NEXT_DIST_DIR`), because the browser's `/api` rewrite is fixed at
   build time and must point at the e2e API. It starts on port 3500 with an empty data cache.
3. **Tests** run one file at a time (they share the database), in the `desktop` project and,
   for tests tagged `@mobile`, a Pixel 7 phone profile.
4. **Teardown:** when Playwright stops the API, the launcher drops only the database it created.
   `E2E_KEEP_DATABASE=1` keeps it for debugging.

A run that is killed outright (for example `kill -9`) can leave its database behind. List them
with `psql "$DATABASE_URL" -c "select datname from pg_database where datname like 'seshakart_e2e_%'"`
and drop the ones you no longer need.

| Variable                        | Default                    | Purpose                                                                       |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `E2E_DATABASE_URL`              | `DATABASE_URL`             | Database server on which each run creates its own database (needs `CREATEDB`) |
| `E2E_REDIS_URL`                 | `redis://localhost:6379/6` | Redis DB for the run (emptied at start)                                       |
| `E2E_API_PORT` / `E2E_WEB_PORT` | `4500` / `3500`            | Ports, chosen not to clash with development (4000/3000)                       |
| `E2E_SKIP_BUILD`                | –                          | `1` reuses `apps/web/.next-e2e` if it exists                                  |
| `E2E_KEEP_DATABASE`             | –                          | `1` keeps the run's database                                                  |
| `E2E_REUSE`                     | –                          | `1` reuses servers already listening on the e2e ports (no fresh database)     |

### What is covered

| Spec               | Journey                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guest-checkout`   | Typo-tolerant search → product → cart → guest cash-on-delivery checkout → confirmation → order tracking without an account                                                                                                                                                              |
| `customer`         | Register → wishlist → online payment (mock gateway) → order in the account → cancellation with refund                                                                                                                                                                                   |
| `admin-fulfilment` | Staff sign-in → dispatch (GST invoice) → delivered; the customer reviews it (keyboard rating), staff approve it and it appears on the product page. A delivered cash-on-delivery item is returned → approved → received (restock) → completed (refund created) → refund paid with a UTR |
| `security-seo`     | Fresh CSP nonce per page, no `unsafe-inline`, injected inline handler refused; admin closed to visitors (redirect) and customers (404, API 403); non-production host closed to crawlers; canonical, Open Graph and Product JSON-LD; 404 status for unknown pages and products           |
| `accessibility`    | axe (WCAG 2.2 AA) on home, categories, listing, search, product, sign-in, register, order tracking, cart, checkout and admin screens                                                                                                                                                    |
| `smoke`            | The stack is up with live catalogue data                                                                                                                                                                                                                                                |

### Writing tests

- Find elements the way people do: `getByRole`, `getByLabel`, visible text. Avoid CSS selectors
  and test ids unless there is no accessible name, which is then usually a bug to fix.
- Create what the test needs (`newCustomer()`, a fresh order) instead of depending on another
  test. Never assert on totals that other tests change.
- Never add fixed waits: wait for what the user would see (`expect(...).toBeVisible()`,
  `waitForURL`).
- Tag journeys customers mostly take on phones with `@mobile`.
- On failure, the HTML report keeps a trace, screenshots and the page's accessibility snapshot
  (`pnpm --filter @seshakart/e2e e2e:report`); CI uploads them as the `playwright-report`
  artifact.

### Known limitations

- **One-time codes** (OTP sign-in, phone verification) and **emails** are covered by the API
  integration tests, which can read the fake outbox; the end-to-end tests use password sign-in.
- **Razorpay's real checkout** isn't exercised: the e2e stack uses the mock gateway (the
  Razorpay adapter, signatures and webhooks have integration tests).
- **Not-found pages raised inside a page** (an unknown product or order) are rendered by the
  browser from the page payload: the server sends the 404 status and an `<html id="__next_error__">`
  shell. This is Next.js 15.5 behaviour, reproduced in a minimal app with only a layout, a
  `not-found.tsx` and a page calling `notFound()`; unknown URLs that match no page are fully
  server-rendered. The `security-seo` spec checks the status and that the page appears. Re-check
  after upgrading Next.js.
