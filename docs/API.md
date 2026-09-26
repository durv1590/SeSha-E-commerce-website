# SeShaKart REST API

Base path: `/api`. The storefront calls it on its own origin, and production routes `/api/*`
through the edge proxy. The same API serves the web app today and native apps later.

## Conventions

- **Success:** `2xx` with `{ "data": …, "meta"?: { page, pageSize, total, totalPages } }`.
- **Errors:** `4xx`/`5xx` with
  `{ "error": { "code", "message", "details"?: [{ "path", "message" }], "requestId" } }`.
  `code` is stable and meant for programs. `message` is safe to show to customers.
- **Money** is an integer in paise. **Timestamps** are ISO-8601 in UTC.
- **Validation** failures return `422 VALIDATION_FAILED` with field `details`. Unknown fields are
  ignored.
- **Pagination:** `?page=1&pageSize=24` (maximum 100).
- **Rate limits:** `429 RATE_LIMITED` responses include `Retry-After`. The global default is
  300/min per IP. Stricter per-route limits are listed below.
- **Request ids:** every response carries `X-Request-Id`. Quote it to support.

## Authentication for clients

| Client     | Sign-in response                                                       | Authenticated requests                | Writes                                                                                             |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Browser    | HttpOnly cookies (`sk_at`, `sk_rt`)                                    | cookies are sent automatically        | Send an `X-CSRF-Token` header equal to the `sk_csrf` cookie. `GET /api/auth/csrf` sets the cookie. |
| Native app | add the `X-Client-Type: app` header; tokens come back in `data.tokens` | `Authorization: Bearer <accessToken>` | no CSRF token needed                                                                               |

When a request returns `401`, call `POST /auth/refresh` once, then retry. Browsers send no body;
apps send `{ "refreshToken" }` with the `X-Client-Type: app` header. A refresh token can be used
**only once**. Reusing an old one revokes every session.

## Endpoints

### Health

| Method | Path            | Auth | Description                                                              |
| ------ | --------------- | ---- | ------------------------------------------------------------------------ |
| GET    | `/health`       | –    | Liveness                                                                 |
| GET    | `/health/ready` | –    | Readiness. Returns 503 if the database is down (or Redis in production). |

### Auth: `/auth`

| Method | Path                             | Auth                   | Limit       | Body / notes                                                                                                                          |
| ------ | -------------------------------- | ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/auth/csrf`                     | –                      | –           | Sets the `sk_csrf` cookie                                                                                                             |
| POST   | `/auth/register`                 | –                      | 5 / 10 min  | `{ name, email?, phone?, password, marketingOptIn? }`. Email or phone is required. Returns 409 with `EMAIL_TAKEN` or `PHONE_TAKEN`.   |
| POST   | `/auth/login`                    | –                      | 10 / min    | `{ identifier, password }`. The identifier is an email or a mobile number. Returns 401 `INVALID_CREDENTIALS` or 429 `ACCOUNT_LOCKED`. |
| POST   | `/auth/otp/request`              | –                      | 5 / 10 min  | `{ identifier }`. Always returns 202 with a generic message. Can return 429 `OTP_TOO_SOON` or `OTP_LIMIT`, or 503 `SMS_UNAVAILABLE`.  |
| POST   | `/auth/otp/verify`               | –                      | 10 / 10 min | `{ identifier, code }`. Signs in and marks the contact as verified.                                                                   |
| POST   | `/auth/refresh`                  | refresh cookie or body | 30 / min    | Rotates the refresh token                                                                                                             |
| GET    | `/auth/session/renew?next=/path` | refresh cookie         | 30 / min    | Browser page-navigation renewal. Redirects with 303 to `next` (same-site paths only) or to `/login`.                                  |
| POST   | `/auth/logout`                   | optional               | –           | Revokes this session and clears the cookies                                                                                           |
| POST   | `/auth/logout-all`               | ✔                      | –           | Revokes every session                                                                                                                 |
| POST   | `/auth/password/forgot`          | –                      | 5 / 10 min  | `{ identifier }`. Returns 202 with a generic message.                                                                                 |
| POST   | `/auth/password/reset`           | –                      | 10 / 10 min | `{ identifier, code, password }`. Signs out everywhere.                                                                               |
| GET    | `/auth/me`                       | ✔                      | –           | The user, plus `permissions` (for UI display only)                                                                                    |

### Customer account: `/users/me` (sign-in required)

| Method         | Path                               | Description                                                                                                                                               |
| -------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET / PATCH    | `/users/me`                        | Profile: `{ name?, email?, phone?, marketingOptIn? }`. A changed contact becomes unverified again. Returns 409 `CONTACT_TAKEN` or 422 `CONTACT_REQUIRED`. |
| POST           | `/users/me/password`               | `{ currentPassword?, newPassword }`. Signs out other devices. Returns 422 `WRONG_PASSWORD`.                                                               |
| POST           | `/users/me/verify/request`         | `{ channel: "EMAIL" \| "SMS" }` sends a verification code                                                                                                 |
| POST           | `/users/me/verify/confirm`         | `{ channel, code }`                                                                                                                                       |
| GET            | `/users/me/sessions`               | Active devices; `current` marks this one                                                                                                                  |
| DELETE         | `/users/me/sessions/:id`           | Sign out a device (returns 404 for other users' sessions)                                                                                                 |
| GET / POST     | `/users/me/addresses`              | List, or create (up to 20). The first address becomes the default.                                                                                        |
| PATCH / DELETE | `/users/me/addresses/:id`          | Update (set `isDefault: true` to make it the default) or delete (the default moves to another address)                                                    |
| GET            | `/users/me/notifications`          | Paginated, plus an `unread` count                                                                                                                         |
| POST           | `/users/me/notifications/read`     | Mark all as read                                                                                                                                          |
| POST           | `/users/me/notifications/:id/read` | Mark one as read                                                                                                                                          |

Indian address fields: `name`, `phone` (10-digit mobile), `line1`, `line2?`, `landmark?`, `city`,
`state`, `pincode` (6 digits), `label` (`HOME`, `WORK` or `OTHER`), `isDefault`.

### Settings

| Method | Path               | Auth | Description                                                                                           |
| ------ | ------------------ | ---- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/settings/public` | –    | Store name, tagline, support contacts, free-shipping threshold, COD availability. Cacheable for 60 s. |

### Catalogue (public, CDN-cacheable: `Cache-Control: public, max-age=60, stale-while-revalidate=300`)

| Method | Path                        | Description                                                                                                                                                             |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/home`                     | Homepage: active hero and promo banners (within their date window), featured categories, admin-configured product sections (empty ones are omitted) and featured brands |
| GET    | `/categories`               | Active category tree (3 levels). Inactive categories hide their whole subtree.                                                                                          |
| GET    | `/categories/:slug`         | Category detail with breadcrumbs, children and SEO copy                                                                                                                 |
| GET    | `/brands` · `/brands/:slug` | Active brands, or one brand                                                                                                                                             |
| GET    | `/products`                 | Listing: filters, sort, pagination and facets (below)                                                                                                                   |
| GET    | `/products/:slug`           | Product detail: variants with per-variant availability, images, specifications, policies and breadcrumbs. Drafts and archived products return 404.                      |
| GET    | `/products/:slug/related`   | Up to 12 products from the same category                                                                                                                                |
| GET    | `/media/*`                  | Stored images (local media driver): immutable caching and `CSP: sandbox`                                                                                                |

**Listing query** (`/products`). The same parameters appear in storefront URLs:

| Param              | Example               | Meaning                                                                             |
| ------------------ | --------------------- | ----------------------------------------------------------------------------------- |
| `q`                | `wireless earbuds`    | Search text (1–100 characters); see **Search** below                                |
| `category`         | `audio`               | Category slug, including all its sub-categories                                     |
| `brand`            | `aurora-sound,voltix` | One or more brand slugs                                                             |
| `min`, `max`       | `500`, `5000`         | Price range in **rupees** (converted to paise internally)                           |
| `discount`         | `30`                  | Minimum discount %                                                                  |
| `rating`           | `4`                   | Minimum average rating                                                              |
| `inStock`          | `1`                   | Only products with available stock                                                  |
| `featured`         | `1`                   | Featured products only                                                              |
| `sort`             | `popular`             | `popular`, `newest`, `price_asc`, `price_desc`, `discount`, `rating` or `relevance` |
| `page`, `pageSize` | `2`, `24`             | Page size is at most 60                                                             |

The response is `data: { items: ProductSummary[], facets, query, correctedQuery }` plus `meta`. **Facets** give brand
and category counts and the price range. Each facet ignores its **own** filter, so shoppers can
widen a selection. `ProductSummary.price` and `mrp` belong to the cheapest active variant.
Ratings are only ever aggregated from approved reviews.

### Search (public)

| Method | Path                  | Description                                                                                                                                   |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/products?q=…`       | Full search results, combinable with every listing filter. Default sort is `relevance`; facets count only the matching products.              |
| GET    | `/search/suggest?q=…` | As-you-type suggestions: up to 6 products, 4 categories, 3 brands and 4 popular completions. `Cache-Control: max-age=60`; 120 requests/min/IP |
| GET    | `/search/popular`     | `{ trending, popular }`: admin-curated trending terms (setting `search`) and real searches made at least `popularMinCount` times with results |

How a query is matched:

1. Normalised (lower case, accents and punctuation removed, at most 8 words of `[a-z0-9]`), so no
   user text ever reaches `to_tsquery` unescaped.
2. Everyday synonyms are ORed in (`tshirt` → `shirt`, `mobile` → `smartphone`, `tws` → `earbuds`).
3. A word matching a brand name becomes a brand filter (`aurora earbuds`).
4. Weighted full-text search with prefix matching (`ear` finds `earbuds`): name > tags > short
   description > highlights. **Every word must match.**
5. No hits: unknown words are corrected against the live catalogue vocabulary with trigram
   similarity, and `correctedQuery` is returned (`earbds` → `earbuds`).
6. Still nothing and a word is unknown: close product names (trigram word similarity). When
   every word is a real catalogue word that just never occurs together, the result is empty
   rather than a misleading partial match.

Ranking blends text rank, a name-prefix boost, name similarity, sales and in-stock status.
Results are cached for 2 minutes. The engine sits behind a `SearchEngine` interface so a
dedicated engine (OpenSearch, Meilisearch) or semantic search can replace it later.

**Search analytics** are aggregate and anonymous: one row per normalised query with a count and
the last result count, no user, session or IP. Only page 1 of `/products?q=` counts (suggestions
never do), and queries that look like personal data (emails, phone or card-like numbers, URLs)
are never stored.

### Cart: `/cart` (guests and signed-in customers)

| Method | Path              | Body                            | Description                                                                                |
| ------ | ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/cart`           |                                 | The cart with live prices, stock, coupon and totals (`CartDto`); `Cache-Control: no-store` |
| GET    | `/cart/summary`   |                                 | `{ count }` for the header badge (units, excluding saved for later)                        |
| POST   | `/cart/items`     | `{ variantId, quantity? }`      | Adds (or adds to) a line; moves a saved-for-later line back. 60/min                        |
| PATCH  | `/cart/items/:id` | `{ quantity?, savedForLater? }` | Changes quantity or saves for later / moves back                                           |
| DELETE | `/cart/items/:id` |                                 | Removes a line                                                                             |
| POST   | `/cart/coupon`    | `{ code }`                      | Applies a coupon (case-insensitive). **10 per 10 minutes** to stop code guessing           |
| DELETE | `/cart/coupon`    |                                 | Removes the coupon                                                                         |

Every write returns the full `CartDto`. **The client never sends prices or totals**: only a
variant, a quantity or a code.

- **Who owns a cart:** a signed-in customer, or a guest identified by a random 256-bit token:
  the HttpOnly `sk_cart` cookie (path `/api`, `SameSite=Lax`, renewed on every change) for
  browsers, or the `X-Cart-Token` header for apps (returned on the first add). Only an HMAC of
  the token is stored. A browser holding the cart cookie is subject to CSRF checks like a
  signed-in one.
- **On sign-in** (password, OTP or registration) the guest cart joins the account's cart:
  quantities for the same variant add up (capped at the per-item limit), the guest cart is
  deleted and its cookie cleared.
- **Validation on every change:** the variant, its product and its category must be active,
  stock (`stock − reserved`) must cover the quantity, and the quantity must not exceed the
  admin's `maxQuantityPerItem` (default 10). Errors: `PRODUCT_UNAVAILABLE` (404),
  `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `QUANTITY_LIMIT`, `CART_FULL` (50 lines) (409).
- **Validation on every read:** lines whose product was withdrawn (`UNAVAILABLE`), sold out
  (`OUT_OF_STOCK`) or no longer has enough stock (`INSUFFICIENT_STOCK`, with `maxQuantity`) are
  flagged, left out of the totals, and set `canCheckout: false` until the shopper fixes them.
- **Totals:** `mrpTotal`, `subtotal`, `productDiscount` (MRP savings), `couponDiscount`,
  `shippingFee` (standard delivery, free when the amount after the coupon reaches
  `freeShippingThreshold`), `taxIncluded` (GST already inside the prices, per line at the
  product's rate, after its share of the coupon) and `total`. Express delivery and the COD fee
  are chosen at checkout.
- Guest carts untouched for `cartRetentionDays` (default 60) are deleted.

**Coupon rules** (all checked server-side, again on every read; an applied coupon that stops
qualifying stays visible with `valid: false` and a reason, and gives no discount):

| Rule                                   | Behaviour                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| Active, start and end dates            | Otherwise "isn’t valid", "isn’t active yet" or "has expired"                        |
| Usage limit (total)                    | `usedCount < usageLimit`                                                            |
| Customer-specific, first order only    | Need a signed-in customer; first-order ignores cancelled orders                     |
| Uses per customer                      | Counted from redemptions (guests are checked by email at checkout)                  |
| Product / category restriction         | Only matching lines (categories include their sub-categories) are discounted        |
| Minimum cart value                     | Whole-cart subtotal; the message says how much more to add                          |
| Percentage (with optional cap) / fixed | Never more than the eligible amount; split across lines exactly (largest remainder) |

### Wishlist: `/wishlist` (sign-in required)

| Method | Path                                | Body             | Description                                                                                                        |
| ------ | ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/wishlist`                         |                  | Items with live price and stock; withdrawn products stay, marked unavailable                                       |
| GET    | `/wishlist/ids`                     |                  | Product ids (for heart icons)                                                                                      |
| POST   | `/wishlist`                         | `{ productId }`  | Adds (idempotent; up to 200 products). Returns the ids                                                             |
| DELETE | `/wishlist/:productId`              |                  | Removes. Returns the ids                                                                                           |
| POST   | `/wishlist/:productId/move-to-cart` | `{ variantId? }` | Adds to the cart and removes from the wishlist. Products with options need a `variantId` (`VARIANT_REQUIRED`, 409) |

### Checkout: `/checkout` (guests and signed-in customers)

| Method | Path                            | Description                                                                                                  |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| POST   | `/checkout/quote`               | `{ deliveryMethod?, paymentMethod? }` → cart, delivery and payment options (with COD eligibility) and totals |
| POST   | `/checkout/orders`              | Places the order (below). 10/min                                                                             |
| GET    | `/checkout/orders/:orderNumber` | Order summary for the confirmation and payment pages: the customer, or a guest sending `X-Order-Token`       |

**Placing an order** (`POST /checkout/orders`):

```jsonc
{
  "contact": { "email": "asha@example.com", "phone": "9876543210" }, // guests; customers default to their account
  "shippingAddressId": "…" /* or */,
  "shippingAddress": {
    "name": "…",
    "phone": "…",
    "line1": "…",
    "city": "…",
    "state": "…",
    "pincode": "411001",
  },
  "saveAddress": true, // customers: add a typed address to the address book
  "billingSameAsShipping": true, // else "billingAddress": { … }
  "deliveryMethod": "STANDARD", // or "EXPRESS"
  "paymentMethod": "PREPAID", // or "COD"
  "expectedTotal": 154800, // the total the shopper saw (paise)
  "idempotencyKey": "random 16–64 chars, new per attempt",
  "notes": "Leave with the guard",
}
```

The server re-prices the cart and refuses with **`PRICE_CHANGED`** (409) if the total differs from
`expectedTotal`. Then, in one transaction, it creates the order with line snapshots (name, SKU, HSN,
price, GST and coupon share), reserves stock with a conditional update per line
(`INSUFFICIENT_STOCK` if it sold out meanwhile), claims the coupon atomically (total and
per-customer limits, guests matched by email), and removes the bought lines from the cart.

- **COD**: the order is `CONFIRMED` straight away (stock sold, confirmation email).
- **Online**: the order is `PAYMENT_PENDING`, stock is held for `stockReservationMinutes` (default
  30), and the response carries a `payment` session (gateway order id, amount, public key id,
  prefill). No secret is ever in it.
- The **same `idempotencyKey`** returns the same order (double clicks, retries). Guests receive a
  `guestAccessToken`, bound to their cart credential and shown once, to view the order.

Other errors: `CART_EMPTY`, `CART_NEEDS_ATTENTION`, `COUPON_INVALID` (409), `CONTACT_REQUIRED`,
`PAYMENT_METHOD_UNAVAILABLE`, `DELIVERY_UNAVAILABLE`, `ADDRESS_NOT_FOUND`, and `PAYMENT_UNAVAILABLE`
(502, gateway down: nothing is created and the cart is untouched).

### Payments: `/payments`

| Method | Path                           | Body                                                             | Description                                                                                                         |
| ------ | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| POST   | `/payments/verify`             | `{ orderNumber, providerOrderId, providerPaymentId, signature }` | After the gateway checkout succeeds. The HMAC signature is checked with the key secret, then the order is confirmed |
| POST   | `/payments/failed`             | `{ orderNumber, providerOrderId?, code?, description? }`         | The checkout failed or was closed; the order stays payable until the hold expires                                   |
| POST   | `/payments/retry`              | `{ orderNumber }`                                                | New payment session for a pending order (`null` if a previous attempt turns out to be paid)                         |
| POST   | `/payments/mock/complete`      | `{ orderNumber, outcome: "success" \| "failure" }`               | **Mock gateway only** (development/tests; 404 otherwise): simulates the customer paying                             |
| POST   | `/webhooks/payments/:provider` | raw gateway payload                                              | Gateway webhooks, verified by HMAC over the **raw body** (`X-Razorpay-Signature`); CSRF-exempt                      |

All order and payment calls need the customer's session or the guest's `X-Order-Token`; other
orders return 404 (never 403, so order numbers can't be probed).

**How a payment settles.** Whichever arrives first confirms the order (reserved units become
sold, confirmation email); the rest are no-ops:

1. the browser's `/payments/verify` (signature check);
2. the webhook (`payment.captured` / `order.paid`), stored by `(provider, eventId)` so repeats are
   ignored; failed processing is left unmarked so the gateway's retry runs it again;
3. the **sweeper** (every minute): asks the gateway about pending orders older than 5 minutes
   (lost webhooks) and, once the hold expires, cancels unpaid orders, releasing stock and the
   coupon. If the gateway can't be reached, cancellation waits rather than risk cancelling a paid
   order.

A captured amount different from the order total never confirms it (flagged for review). Money that
arrives after an order was cancelled is **refunded automatically**. Refunds (full or partial) go
through the gateway; the order moves to `REFUND_INITIATED` and then `REFUNDED` when the gateway
reports the refund processed.

### Orders: `/orders` (customers; guests with `X-Order-Token`)

| Method | Path                           | Description                                                                                                                                                                                                            |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/orders?filter=&page=`        | The customer's orders (`all`, `active`, `delivered`, `cancelled`, `returns`), newest first. Sign-in required                                                                                                           |
| GET    | `/orders/:orderNumber`         | Full detail: timeline, delivery estimate, shipments and tracking events, items with returnable quantities, returns, refunds, invoice, allowed actions                                                                  |
| POST   | `/orders/:orderNumber/cancel`  | `{ reason, comments? }`. Until the order is packed. Held stock is released, sold stock restocked, the coupon use given back, and a captured online payment refunded in full                                            |
| POST   | `/orders/:orderNumber/returns` | `{ type: "RETURN" \| "REPLACEMENT", reason, comments?, items: [{ orderItemId, quantity }] }`. Delivered orders, within each product's return window, for returnable products, up to the quantity not already requested |
| GET    | `/orders/:orderNumber/invoice` | GST invoice PDF (`attachment`), available once the order has shipped (`INVOICE_NOT_READY` before)                                                                                                                      |
| POST   | `/orders/track`                | `{ orderNumber, contact }` (email or mobile used for the order). Public, 10 per 10 minutes. Returns status, timeline and tracking only: no address, prices or items                                                    |

Anything that isn't the caller's order returns 404. Reasons are fixed lists (`CANCEL_REASONS`,
`RETURN_REASONS` in `@seshakart/validation`).

### Shipping

| Method | Path                                      | Description                                                                                                             |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/shipping/serviceability?pincode=411001` | `{ serviceable, codAvailable, standard: { from, to }, express, message }`. Dates are India-time business days (Mon–Sat) |

Serviceability comes from the admin's `shipping` settings: blocked PIN prefixes, COD-blocked
prefixes, remote prefixes (slower, no express by default) and day ranges per method. Checkout
applies the same rules: `NOT_SERVICEABLE` (422, field `shippingAddress.pincode`), and express or
COD become unavailable where the rules say so. `POST /checkout/quote` accepts an optional
`pincode` so the page can show this before the order is placed.

### Reviews and content (public)

| Method | Path                                       | Auth     | Description                                                                                                                                                                   |
| ------ | ------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/products/:slug/reviews`                  | –        | Approved reviews. `?sort=recent\|highest\|lowest&rating=1..5&page&pageSize` → `{ summary: { average, count, distribution[5] }, reviews[] }` + pagination                      |
| POST   | `/reviews`                                 | customer | `{ productId, rating 1–5, title?, body 10–3000 }`: create or edit your review. Only after the product was delivered to you (`NOT_PURCHASED`, 403). Edits return to moderation |
| DELETE | `/reviews/:id`                             | customer | Delete your review                                                                                                                                                            |
| GET    | `/users/me/reviews`                        | customer | `{ reviews[] (with status and the moderator's reason), awaiting[] }`: delivered products not yet reviewed                                                                     |
| GET    | `/users/me/reviews/eligibility/:productId` | customer | `{ canReview, review }`                                                                                                                                                       |
| GET    | `/pages`                                   | –        | Published CMS pages `[{ slug, title }]`                                                                                                                                       |
| GET    | `/pages/:slug`                             | –        | A published page: `{ slug, title, content (restricted Markdown), metaTitle, metaDescription, updatedAt }`                                                                     |
| GET    | `/seo-overrides`                           | –        | `[{ path, title, description, ogImage, noindex }]` applied by the storefront to matching pages                                                                                |

Reviewer names are shown as first name and last initial. A product's rating counts approved
reviews only.

### Staff: `/admin` (permission-gated, audit-logged)

Every route needs a staff session with the listed permission (see `ROLE_PERMISSIONS`), and every
write is recorded in the audit log. Lists return `{ data, meta }` with `page` / `pageSize`.
Uploads are `multipart/form-data` with one `file` field.

**Dashboard, alerts, media**

| Method | Path               | Permission                                      | Description                                                                                                           |
| ------ | ------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/dashboard` | `dashboard:read`                                | KPIs (today, 7 and 30 days with previous periods), 30-day series, work queues, recent orders, top products            |
| GET    | `/admin/alerts`    | `dashboard:read`                                | "Needs attention" counts, only those the caller's role can act on                                                     |
| POST   | `/admin/media`     | any of products/content/categories/brands write | Image upload (≤ 8 MB; JPEG, PNG, WebP, AVIF, GIF; ≥ 200 px) → re-encoded WebP `{ id, url, width, height, sizeBytes }` |

**Catalogue**

| Method          | Path                                 | Permission                              | Description                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET             | `/admin/products`                    | `products:read`                         | `?q&status&categoryId&brandId&stock=low\|out&sort=updated\|name\|price\|stock\|sold`                                                                                                                                                                                                      |
| GET             | `/admin/products/:id`                | `products:read`                         | Full product with variants (stock, reserved, `hasOrders`) and images                                                                                                                                                                                                                      |
| POST / PUT      | `/admin/products` / `/:id`           | `products:write`                        | Whole product: details, `variants[]` (existing ones by `id`), `images[]` (`id` or uploaded `mediaId`, `alt` required). PUT takes `expectedUpdatedAt` (`STALE_PRODUCT`, 409). Removed variants are deleted, or deactivated when ordered. `SKU_TAKEN` / `SLUG_TAKEN` (409) with field paths |
| POST            | `/admin/products/:id/status`         | `products:write`                        | `{ status: DRAFT\|ACTIVE\|ARCHIVED }`. Publishing needs an active variant, an image and a visible category (`NOT_PUBLISHABLE`, 422)                                                                                                                                                       |
| POST            | `/admin/products/:id/duplicate`      | `products:write`                        | Copy as a draft with `-COPY` SKUs and no stock                                                                                                                                                                                                                                            |
| DELETE          | `/admin/products/:id`                | `products:delete`                       | Only never-ordered products (`PRODUCT_HAS_ORDERS`, 409)                                                                                                                                                                                                                                   |
| GET             | `/admin/products/export.csv`         | `products:read`                         | One row per variant; formula-safe; UTF-8 with BOM                                                                                                                                                                                                                                         |
| POST            | `/admin/products/import?dryRun=`     | `products:write`                        | CSV (≤ 2 MB, 5,000 rows). Dry run by default: `{ products, variants: {create, update, unchanged}, errors[{line, column, message}] }`. Applied all-or-nothing when `dryRun=false` and error-free                                                                                           |
| GET             | `/admin/categories`, `/admin/brands` | `products:read` or the write permission | Full lists with product counts (categories parent-first, with depth)                                                                                                                                                                                                                      |
| POST/PUT/DELETE | `/admin/categories[/:id]`            | `categories:write`                      | Three levels max (`CATEGORY_TOO_DEEP`), no cycles (`CATEGORY_CYCLE`); moves carry the subtree. Delete only when empty (`CATEGORY_IN_USE`)                                                                                                                                                 |
| POST/PUT/DELETE | `/admin/brands[/:id]`                | `brands:write`                          | Unique names (`BRAND_EXISTS`); delete only without products (`BRAND_IN_USE`)                                                                                                                                                                                                              |
| GET             | `/admin/inventory`                   | `inventory:read`                        | Stock per variant. `?q&stock=low\|out` (low/out: live products only)                                                                                                                                                                                                                      |
| POST            | `/admin/inventory/:variantId/adjust` | `inventory:write`                       | `{ mode: add\|remove\|set, quantity, reason }`; never below reserved (`BELOW_RESERVED`, 409); ledgered                                                                                                                                                                                    |
| PATCH           | `/admin/inventory/:variantId`        | `inventory:write`                       | `{ lowStockThreshold }`                                                                                                                                                                                                                                                                   |
| GET             | `/admin/inventory/:variantId/ledger` | `inventory:read`                        | Stock movements with order numbers and staff names                                                                                                                                                                                                                                        |

**Orders, returns, customers, coupons**

| Method              | Path                                          | Permission        | Description                                                                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                 | `/admin/orders`                               | `orders:read`     | `?q` (order number, email, phone, name) `&status=all\|to_ship\|returns\|refund_pending\|<ORDER_STATUS>&payment=PREPAID\|COD&from&to` (India-time days)                                                                                                                        |
| GET                 | `/admin/orders/export.csv`                    | `orders:read`     | The same filters as CSV (up to 10,000 orders)                                                                                                                                                                                                                                 |
| GET                 | `/admin/orders/:orderNumber`                  | `orders:read`     | Order detail plus payments, refunds (with ids), status history with staff names, customer summary and `actions` (allowed status moves, ship, tracking, cancel, refundable amount)                                                                                             |
| GET                 | `/admin/orders/:orderNumber/invoice`          | `orders:read`     | GST invoice PDF (after dispatch)                                                                                                                                                                                                                                              |
| POST                | `/admin/orders/:orderNumber/status`           | `orders:write`    | `{ status: "PROCESSING" \| "PACKED", note? }`                                                                                                                                                                                                                                 |
| POST                | `/admin/orders/:orderNumber/shipments`        | `orders:write`    | `{ carrier, trackingNumber, trackingUrl?, estimatedDelivery? }`: dispatches the order (SHIPPED), issues the invoice number, emails the customer. `TRACKING_NUMBER_IN_USE` if the carrier's number is already used                                                             |
| POST                | `/admin/orders/:orderNumber/shipments/events` | `orders:write`    | `{ status: IN_TRANSIT \| OUT_FOR_DELIVERY \| DELIVERED \| FAILED \| RETURNED, location?, note?, at? }`. Delivery records the cash collected for COD; `RETURNED` (undeliverable) restocks and refunds prepaid orders; `FAILED` moves an out-for-delivery order back to shipped |
| POST                | `/admin/orders/:orderNumber/cancel`           | `orders:write`    | `{ reason }`: until packed                                                                                                                                                                                                                                                    |
| POST                | `/admin/orders/:orderNumber/refunds`          | `orders:refund`   | `{ amount?, reason }`: gateway refund (or a manual one for COD)                                                                                                                                                                                                               |
| GET                 | `/admin/returns`                              | `orders:read`     | `?status=open\|all\|<RETURN_STATUS>`; open requests oldest first                                                                                                                                                                                                              |
| POST                | `/admin/returns/:id`                          | `orders:write`    | `{ action: approve \| reject \| receive \| complete, note?, restock? }`. Receive restocks; completing a return refunds what was paid for those units (coupon share excluded); rejecting the last open request returns the order to DELIVERED                                  |
| POST                | `/admin/refunds/:id/complete`                 | `orders:refund`   | `{ reference }`: records a manual (COD) refund as paid, with the bank/UPI reference                                                                                                                                                                                           |
| GET                 | `/admin/customers[/:id]`                      | `customers:read`  | List (`?q&status&sort=recent\|spent\|orders`) with order count and spend; detail with addresses, recent orders, sessions                                                                                                                                                      |
| POST                | `/admin/customers/:id/status`                 | `customers:write` | `{ status: ACTIVE\|SUSPENDED, reason (required to suspend) }`. Suspending revokes every session                                                                                                                                                                               |
| GET/POST/PUT/DELETE | `/admin/coupons[/:id]`                        | `coupons:write`   | `?state=live\|scheduled\|expired\|inactive&q`. Used coupons keep their code and can't be deleted (`COUPON_IN_USE`); `usageLimit` can't drop below uses                                                                                                                        |

**Content, SEO, settings**

| Method              | Path                         | Permission       | Description                                                                                         |
| ------------------- | ---------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| GET/POST/PUT/DELETE | `/admin/banners[/:id]`       | `content:write`  | Placement, theme, links (site path or https), images with required alt text, schedule, priority     |
| GET/POST/PUT/DELETE | `/admin/home-sections[/:id]` | `content:write`  | Product rails (`CATEGORY` needs `categoryId`). Writes return the full ordered list                  |
| PUT                 | `/admin/home-sections/order` | `content:write`  | `{ ids }`: every section exactly once (`STALE_ORDER`, 409)                                          |
| GET/POST/PUT/DELETE | `/admin/pages[/:id]`         | `content:write`  | CMS pages (restricted Markdown), drafts stay private                                                |
| GET/POST/PUT/DELETE | `/admin/seo[/:id]`           | `seo:write`      | Per-path overrides; admin/account/checkout/cart/API paths refused; one per path (`SEO_PATH_EXISTS`) |
| GET / PUT           | `/admin/settings/:key`       | `settings:write` | `store`, `commerce`, `shipping`, `search`: read, or replace with a full, validated object           |

**Engagement, reports, staff**

| Method | Path                          | Permission         | Description                                                                                                                                                     |
| ------ | ----------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/reviews`              | `reviews:moderate` | `?status=PENDING\|APPROVED\|REJECTED\|all&rating&q`                                                                                                             |
| POST   | `/admin/reviews/:id/moderate` | `reviews:moderate` | `{ action: approve\|reject, note (required to reject) }`; recomputes the product rating                                                                         |
| GET    | `/admin/reports/sales`        | `analytics:read`   | `?from&to&groupBy=day\|month` (≤ 2 years, India time): rows, totals, by payment method, by category. Refunds count when processed                               |
| GET    | `/admin/reports/sales.csv`    | `analytics:read`   | The same as CSV                                                                                                                                                 |
| GET    | `/admin/audit`                | `audit:read`       | `?action` (prefix, e.g. `order`) `&entityType&entityId&actorId&from&to`                                                                                         |
| GET    | `/admin/staff`                | `staff:write`      | Staff accounts                                                                                                                                                  |
| POST   | `/admin/staff`                | `staff:write`      | `{ name, email, role }`: new account without a password (emailed to set one via "Forgot password"), or promotes an existing customer (`ALREADY_STAFF`)          |
| PUT    | `/admin/staff/:id`            | `staff:write`      | `{ role (or CUSTOMER to remove access), status }`. Not yourself (`CANNOT_CHANGE_SELF`); never the last active super admin; suspension or removal signs them out |

**Order lifecycle** (`apps/api/src/orders/order-status.ts`): `PENDING → PAYMENT_PENDING →
CONFIRMED → PROCESSING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED → RETURN_REQUESTED →
RETURNED`, with `CANCELLED` possible until packed, and `REFUND_INITIATED → REFUNDED` after a
cancellation or return. Any other change is refused (`INVALID_STATUS_CHANGE`). Refunds on an order
that is still being fulfilled don't change its status. Customers get emails when an order ships,
goes out for delivery, is delivered, is cancelled or refunded, and as a return progresses.
