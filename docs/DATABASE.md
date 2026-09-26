# Database

PostgreSQL 16, accessed only by the API through Prisma ORM 6. The web app never connects to
the database. It goes through the API so that every business rule is enforced in one place.

- Schema: `apps/api/prisma/schema.prisma`
- Migrations: `apps/api/prisma/migrations/`
- Base seed: `apps/api/src/database/seed.ts`

## Conventions

| Rule                                                                                     | Why                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Money is `Int` in paise** (₹1 = 100)                                                   | No floating-point rounding in prices, GST, coupons or refunds.                                                            |
| Prices are **GST-inclusive** (Indian MRP convention); `taxRate` is the GST slab          | The tax component is derived for invoices, not added at checkout.                                                         |
| ids are `cuid()` strings                                                                 | Not guessable or enumerable like sequential integers (helps against IDOR). They are also safe to expose in URLs and APIs. |
| snake_case tables and columns (`@@map` / `@map`), camelCase in code                      | Idiomatic SQL for analysts and idiomatic TypeScript for developers.                                                       |
| **Order lines and addresses are snapshots** (`OrderItem`, `Order.shippingAddress`)       | Editing or deleting a product, price or address never rewrites order history or invoices.                                 |
| Soft lifecycle via status (`ProductStatus.ARCHIVED`) rather than deletes                 | Keeps referential history intact.                                                                                         |
| Timestamps: `created_at` and `updated_at` everywhere, UTC                                | Consistent auditing.                                                                                                      |
| Roles and permissions are defined **in code** (`packages/types`), stored on `users.role` | The RBAC rules are versioned, reviewed and testable. See ARCHITECTURE.md.                                                 |

## Entity overview

```
identity      User ─┬─ Session (refresh tokens, hashed)      OtpCode (hashed codes)
                    ├─ Address
                    ├─ Cart ── CartItem ── ProductVariant
                    ├─ Wishlist ── WishlistItem ── Product
                    ├─ Order ─┬─ OrderItem (snapshot) ─ Review
                    │         ├─ OrderStatusHistory
                    │         ├─ Payment ── Refund
                    │         ├─ Shipment (forward & return)
                    │         ├─ ReturnRequest
                    │         └─ CouponUsage ── Coupon
                    ├─ Review, ProductQuestion, Notification
                    └─ AuditLog (actor)

catalogue     Category (self-tree, depth 0..2) ── Product ─┬─ ProductVariant ── Inventory
              Brand ───────────────────────────────────────┤                 └ InventoryTransaction (ledger)
                                                           └─ ProductImage
content       Banner · HomeSection · Page · SeoOverride · MediaAsset · Setting
operations    WebhookEvent (idempotency) · SearchQuery (aggregate) · NewsletterSubscriber · ContactMessage
```

The spec's core entities all exist. `Role` and `Permission` are code-level definitions, as noted above.
`SEO` is `SeoOverride`. Extra tables that the features need: `Session`, `OtpCode`,
`OrderStatusHistory`, `Refund`, `WebhookEvent`, `ReturnRequest`, `ProductQuestion`, `HomeSection`,
`MediaAsset`, `SearchQuery`, `NewsletterSubscriber` and `ContactMessage`.

### Inventory model

`available = stock − reserved`. `Inventory` keeps one row per variant.

| Event                                    | `stock` | `reserved` | Ledger type              |
| ---------------------------------------- | ------- | ---------- | ------------------------ |
| Admin restock or adjustment              | ± n     | –          | `RESTOCK` / `ADJUSTMENT` |
| Order placed, awaiting online payment    | –       | + n        | `RESERVE`                |
| Payment captured, or COD order confirmed | − n     | − n        | `SALE`                   |
| Payment failed or reservation expired    | –       | − n        | `RELEASE`                |
| Return received                          | + n     | –          | `RETURN`                 |

Reservations use a conditional update in a transaction:
`UPDATE inventory SET reserved = reserved + n WHERE variant_id = … AND stock - reserved >= n`.
Zero rows updated means insufficient stock. The CHECK constraint below is a second, independent
guarantee. The integration test `test/database.spec.ts` races ten buyers for three units and
asserts that exactly three succeed.

## Constraints enforced by the database

Prisma's schema language can't express these, so they live in hand-written SQL inside the
migrations. `test/database.spec.ts` proves each one rejects bad writes:

- **Inventory:** `stock ≥ 0`, `reserved ≥ 0`, `reserved ≤ stock`. Overselling is impossible even if application code has a bug.
- **Variants:** `price > 0` and `mrp ≥ price`. At most one default variant per product (partial unique index).
- **Products:** `tax_rate ∈ {0, 3, 5, 12, 18, 28}`, return window 0–90 days, rating 0–5.
- **Orders:** `grand_total = subtotal − coupon_discount + shipping_fee + cod_fee`, and all amounts ≥ 0.
- **Users:** email or phone required, email stored lower-case, phone is a valid Indian mobile.
- **Addresses:** valid PIN code and mobile. At most one default address per user.
- **Coupons:** upper-case code, a percentage ≤ 100, a valid date window and usage limits > 0.
- **Reviews:** rating 1–5, one review per user per product. Categories: depth 0–2, never their own parent.
- **Carts:** belong to a user or a guest token (only its HMAC is stored), with quantity 1–99. Guest
  carts untouched for `cartRetentionDays` are purged every 6 hours. Wishlists belong to users only.

Other database objects:

- `order_number_seq`: a sequence that produces human-friendly order numbers
  (`SK` + India date `YYMMDD` + at least 6 digits).
- `orders.idempotency_key` (unique): the same place-order request never creates two orders.
- Order stock flow, all recorded in `inventory_transactions`: `RESERVE` at placement
  (`reserved += q` only if `stock - reserved >= q`), then `SALE` at confirmation (`stock -= q`,
  `reserved -= q`, `sold_count += q`) or `RELEASE` when an unpaid order expires.
- `sk_product_search_document()`: an IMMUTABLE function that builds a weighted full-text document
  (name A, tags B, short description C, highlights D). It backs a GIN expression index.
- Trigram GIN indexes (`pg_trgm`) on product, brand and category names and on popular searches.
  They provide typo tolerance: search corrects unknown words to the closest catalogue word
  (`similarity ≥ 0.3`) and falls back to `word_similarity(q, name) ≥ 0.45`; the default operator
  threshold of 0.6 misses one-letter typos in short words. See API.md → Search.
- Partial index for active product listings, and an expression index on available stock (for the
  low-stock dashboard).

**Drift guard:** `pnpm db:check` (run in CI) fails if the migrations and `schema.prisma` disagree.
Prisma ignores CHECK constraints, expression indexes and partial indexes, so these persist across
future migrations. Plain-column indexes, including trigram indexes, must be declared in the schema,
otherwise the next generated migration would drop them.

### Product aggregates (triggers)

`products.min_price`, `min_price_mrp`, `max_discount_pct` and `available_stock` are
**maintained by PostgreSQL triggers** on `product_variants` and `inventory`. Every write path keeps
them correct automatically: catalogue edits, checkout reservations, returns and direct SQL. Listing
pages filter and sort on them without joining variants and inventory. Never write these columns
from application code. `test/database.spec.ts` covers the triggers.

## Local setup

```bash
pnpm infra:up                 # Postgres + Redis in Docker (creates seshakart, _test, _shadow)
cp .env.example .env          # set DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
pnpm db:deploy                # apply migrations
pnpm build:packages && pnpm --filter @seshakart/api build
pnpm db:seed                  # default settings + first super admin (idempotent)
pnpm db:studio                # optional: browse data
```

Using a local PostgreSQL instead of Docker? Create the `seshakart`, `seshakart_test` and
`seshakart_shadow` databases, owned by a user with `CREATEDB`. The migrations create the `pg_trgm`
extension, which is a trusted extension, so the database owner can install it.

## Changing the schema

1. Edit `schema.prisma`.
2. `pnpm db:migrate --name describe_change` creates and applies a migration interactively. In
   non-interactive environments (CI, containers, agents), run `pnpm db:new describe_change`
   (requires `SHADOW_DATABASE_URL`), review the SQL, then run `pnpm db:deploy`.
3. For anything Prisma can't express (a CHECK or expression index), run
   `pnpm db:migrate --create-only --name …`, add the SQL to the generated file, then run
   `pnpm db:migrate` to apply it.
4. Update the shared enums in `packages/types` if an enum changed. `src/database/enums.spec.ts`
   fails otherwise.
5. Run `pnpm db:check` and `pnpm test`.

Never edit a migration that has already been applied in any shared environment. Add a new one instead.

## Seed

`pnpm db:seed` is **idempotent** and safe on every deploy:

- It creates default `store` and `commerce` settings only when they're missing. Existing admin edits
  are never overwritten.
- It creates the first **SUPER_ADMIN** from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, hashed with
  argon2id. It never changes an existing admin's password. In production both variables are required,
  and the password must meet the password policy.
- It never creates fake customers, orders or reviews.

### Demo catalogue (development, QA and staging only)

`pnpm db:seed:demo` builds a labelled demo store:

- 30 categories (3 levels), 9 **fictional** brands marked "(demo)" and 39 products with realistic
  Indian pricing, GST slabs, HSN codes, variants and stock (including low-stock and out-of-stock
  cases).
- 5 banners and 5 homepage sections.
- **Generated demo images** (Lucide line icons in brand colours, stamped "DEMO IMAGE").

It seeds **no reviews or ratings**. `soldCount` values exist only to demonstrate "Best sellers"
ordering. Re-running replaces the demo data. `pnpm db:seed:demo --remove` deletes every demo record
and image. **Run the remove command before launch.** The command refuses to run with
`NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` (staging).

## Tests

Integration tests use a **separate** database (`TEST_DATABASE_URL`, which must contain `_test`; the
setup refuses anything else). Migrations are applied automatically before the run, and tables are
truncated between suites. Set `TEST_REDIS_URL=redis://localhost:6379/15` to include the Redis-backed
cache and rate-limit tests.

## Production operations

- **Migrations** run as a release step before new API containers start:
  `docker compose run --rm api npm run migrate:production`. The migrations are additive and backward
  compatible, so they're safe during rolling deploys.
- **Backups:** managed PostgreSQL with automated daily snapshots, point-in-time recovery (7+ days) and
  a quarterly restore drill. See DEPLOYMENT.md (Phase 14).
- **Connection pooling:** set `connection_limit` in `DATABASE_URL` per instance, or use PgBouncer in
  transaction mode for many instances.
- **Slow queries** (≥ `DB_SLOW_QUERY_MS`) are logged without parameters, which may contain personal data.
- **Personal data** lives in `users`, `addresses`, `orders` (contact and address snapshots) and
  `contact_messages`. OTPs, refresh tokens and guest tokens are stored only as hashes.
