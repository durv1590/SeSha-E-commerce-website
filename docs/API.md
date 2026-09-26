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
| `category`         | `audio`               | Category slug, including all its sub-categories                                     |
| `brand`            | `aurora-sound,voltix` | One or more brand slugs                                                             |
| `min`, `max`       | `500`, `5000`         | Price range in **rupees** (converted to paise internally)                           |
| `discount`         | `30`                  | Minimum discount %                                                                  |
| `rating`           | `4`                   | Minimum average rating                                                              |
| `inStock`          | `1`                   | Only products with available stock                                                  |
| `featured`         | `1`                   | Featured products only                                                              |
| `sort`             | `popular`             | `popular`, `newest`, `price_asc`, `price_desc`, `discount`, `rating` or `relevance` |
| `page`, `pageSize` | `2`, `24`             | Page size is at most 60                                                             |

The response is `data: { items: ProductSummary[], facets }` plus `meta`. **Facets** give brand
and category counts and the price range. Each facet ignores its **own** filter, so shoppers can
widen a selection. `ProductSummary.price` and `mrp` belong to the cheapest active variant.
Ratings are only ever aggregated from approved reviews.

Search, cart, checkout, orders, payments and admin endpoints are documented here as their phases
land.
