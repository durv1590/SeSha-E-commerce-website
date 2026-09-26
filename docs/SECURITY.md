# Security

Security is a first-class requirement for SeShaKart. This document describes the controls in
place and the assumptions they rely on. It is updated in every phase and gets a full audit in
Phase 12.

**Reporting a vulnerability:** email durvesh15aug@gmail.com with the subject "Security". Please
don't open public issues for vulnerabilities.

## Authentication

| Control                  | Implementation                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing         | **argon2id** with 19 MiB memory, t=2, p=1 (OWASP parameters). Passwords are capped at 128 characters to bound hashing cost.                                                                                                                                                                                                                                                         |
| Password policy          | At least 8 characters with a letter and a number, and not on a common-password deny-list. Existing passwords are never re-validated at login.                                                                                                                                                                                                                                       |
| Brute force              | Per-IP limits: login 10/min, register 5 per 10 min, code requests 5 per 10 min, refresh 30/min. **Account lockout** for 15 minutes after 5 wrong passwords. Every lockout is written to the audit log.                                                                                                                                                                              |
| Account enumeration      | Login gives the same response for an unknown account and a wrong password. Code-based login and forgot-password always reply "If an account exists…" and send nothing to unknown recipients. A dummy argon2 verification equalises timing. **Accepted trade-offs:** registration reports "email already registered", and a locked account says it is locked. Both are rate-limited. |
| One-time codes (OTP)     | 6 digits from the crypto RNG, valid 10 minutes, single-use (conditional consume). Locked after 5 wrong attempts. At most one code per recipient per 60 s and 5 per hour, which prevents SMS pumping and email bombing. Only an **HMAC** bound to recipient and purpose is stored.                                                                                                   |
| Sessions                 | Access tokens are **HS256 JWTs** valid for 15 minutes. The algorithm, issuer and audience are pinned, so `alg: none` and forged signatures are rejected (tested). Refresh tokens are random 256-bit values valid for 30 days, and only their HMAC is stored.                                                                                                                        |
| Refresh rotation         | Every refresh issues a new token. **Reusing a rotated token revokes all of the user's sessions** (RFC 6819 §5.2.2.3), because it indicates token theft. Concurrent refreshes are serialised with a conditional update.                                                                                                                                                              |
| Revocation               | Access tokens are checked against the server-side session, cached for at most 60 s. Logout, logout-everywhere, suspension and role changes take effect immediately (the cache entry is dropped) or within 60 s.                                                                                                                                                                     |
| Password change or reset | A reset revokes **all** sessions. A change keeps the current device and signs out every other one. Both send an email notification and are audited.                                                                                                                                                                                                                                 |
| Native apps              | Send the `X-Client-Type: app` header to receive tokens in the response body and use `Authorization: Bearer`. Browsers **never** receive tokens in JavaScript-readable form.                                                                                                                                                                                                         |

### Cookies

| Cookie    | Contents                                    | Flags                                                                                     |
| --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `sk_at`   | Access JWT                                  | `HttpOnly; SameSite=Lax; Path=/; Secure` in production                                    |
| `sk_rt`   | Refresh token                               | `HttpOnly; SameSite=Lax; Path=/api/auth`, so it only ever reaches the auth endpoints      |
| `sk_sess` | `1`, meaning "a session exists" (no secret) | `SameSite=Lax; Path=/`. Lets the storefront renew sessions and skip unnecessary requests. |
| `sk_csrf` | Random CSRF token                           | `SameSite=Lax; Path=/`, readable by page scripts by design                                |

**Session renewal on page navigation:** when the 15-minute access cookie has expired, the Next.js
middleware redirects to `GET /api/auth/session/renew?next=…`. That endpoint rotates the session
and redirects back. The refresh token never leaves `/api/auth`. The redirect target is restricted
to same-site relative paths (no open redirect; tested).

## Authorisation (RBAC)

- Roles: SUPER_ADMIN, ADMIN, MANAGER, INVENTORY_MANAGER, CUSTOMER_SUPPORT and CUSTOMER. The
  permission matrix lives in `packages/types/src/permissions.ts`.
- Enforced **server-side** by the global `AuthGuard`, using `@Authenticated()` and
  `@RequirePermissions(...)`. It checks the role **currently stored in the database** (through
  the session cache), never the role inside the JWT.
- A test (`every /admin controller … declares required permissions`) fails the build if any
  `admin/*` controller route lacks a permission requirement.
- The web admin UI hides actions the role can't use, for convenience only. Hiding is never the
  security boundary.

### IDOR

Every customer-owned query is scoped by the authenticated user id, for example
`where: { id, userId }`. Integration tests confirm that one customer cannot read, edit or delete
another customer's addresses, sessions or notifications (the API returns 404, not 403, so it
doesn't reveal that the item exists). Record ids are unguessable cuids.

## CSRF

Three layers:

1. **SameSite=Lax** cookies.
2. A **closed CORS** policy: only the storefront origin is allowed.
3. A **double-submit token**: state-changing requests must send an `X-CSRF-Token` header equal to
   the `sk_csrf` cookie, and the values are compared in constant time.

Native-app requests (`Authorization: Bearer` or `X-Client-Type: app`) that carry **no auth
cookies** are exempt. A browser that holds session cookies cannot bypass the check by adding the
app header (tested). Payment and logistics webhooks (Phase 8) use signature verification instead.

## Input validation and data exposure

- Every request body, query and parameter is validated with the Zod schemas shared with the web
  app. **Unknown fields are stripped**, which prevents mass assignment: a customer cannot send
  `role: "SUPER_ADMIN"` (tested).
- Responses use explicit DTO mappers. Password hashes, token hashes, lockout counters and other
  internal fields are never serialised.
- Errors: stack traces, SQL, file paths and constraint names never reach clients. Unexpected
  errors are logged server-side with a request id (tested).
- Search text is reduced to `[a-z0-9]` words before it reaches `to_tsquery`, and every SQL value
  is a bound parameter (`Prisma.sql`), so tsquery syntax and SQL in a query are plain text
  (tested). Queries are capped at 100 characters and suggestions at 120 requests/min/IP.
- Carts: the client only ever sends a variant id, a quantity or a coupon code. Prices, stock,
  discounts, delivery, tax and totals are recomputed from live data on every read and write
  (tested). Guest cart tokens are 256-bit random values stored as an HMAC; the cookie is
  HttpOnly and scoped to `/api`, and a browser holding it must pass the CSRF check (tested).
  Coupon attempts are limited to 10 per 10 minutes per IP.
- Search analytics store no user, session or IP, and never store queries that look like emails,
  phone or card-like numbers, or URLs (tested). Recent searches stay in the shopper's browser.

## Payments

- Gateway secrets (`PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`) live only in the API's
  environment. Browsers receive the public key id and a gateway order id, nothing else.
  Production refuses to start with the mock gateway or without all credentials (tested).
- Card, UPI and bank details are entered in the gateway's own window; SeShaKart never sees them.
- A payment is accepted only with a valid HMAC signature: `order_id|payment_id` with the key
  secret for the browser callback, and the raw request body with the webhook secret for
  webhooks, both compared in constant time (tested, including tampered bodies and swapped
  secrets). Webhooks are CSRF-exempt because they are authenticated by signature.
- The captured amount must equal the order total, or the order is not confirmed.
- Totals are computed server-side; the client's `expectedTotal` only stops silent price changes.
- Order numbers are sequential, so order access is by ownership or a guest token (HMAC-stored,
  bound to the guest's cart credential); anything else returns 404. Place-order is limited to
  10/min per IP, and each order needs a fresh idempotency key.
- Webhook payloads are stored for audit and idempotency (they contain no card data).

## HTTP security headers

- **API:** Helmet with `default-src 'none'`, `frame-ancestors 'none'`, `nosniff` and a
  same-site CORP. `X-Powered-By` is removed.
- **Web:**
  - CSP: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`,
    `form-action 'self'`. The only third-party origins are Razorpay Checkout's: its script
    (`checkout.razorpay.com`), its payment frame and the endpoints it calls (tested).
  - `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and COOP.
  - HSTS (2 years, preload) and `upgrade-insecure-requests` whenever the site URL is https.
- **Known trade-off:** `script-src 'unsafe-inline'` is required by Next.js inline bootstrap
  scripts unless every page uses per-request nonces, which disables static rendering and CDN
  caching. It will be revisited in Phase 12.

## Network and deployment assumptions

- **Client IP and rate limits:** Next.js's `/api` rewrite does **not** forward the visitor's IP.
  In production, the edge proxy (`infra/nginx/seshakart.conf`) must route `/api/*` directly to
  the API. It **overwrites** `X-Forwarded-For` with the client IP (from `CF-Connecting-IP` behind
  Cloudflare), and the API runs with `TRUST_PROXY_HOPS=1`. Without this, every visitor would share
  one IP and the per-IP limits would apply to the whole site. Verified: with `TRUST_PROXY_HOPS=1`,
  forwarded clients are recorded and limited separately.
- **Trusting CF-Connecting-IP** is safe only if the origin firewall accepts traffic from
  Cloudflare's IP ranges alone.
- **Unknown routes:** Nest guards (including the throttler) run only for matched routes. Floods
  against unknown URLs must be absorbed by Cloudflare rate limiting and WAF rules.
- **Production refuses to boot** without Redis (shared rate limits), SMTP, a real SMS provider
  (`SMS_PROVIDER=console` is rejected), secrets of at least 32 characters, or distinct
  `JWT_SECRET` and `SESSION_SECRET` values. Rate limiting cannot be disabled in production.

## Secrets

- The repository never contains `.env` files, credentials or keys (`.gitignore` covers them).
  `.env.example` lists every variable with no real values.
- `JWT_SECRET` and `SESSION_SECRET` must be at least 32 random characters and must differ.
  Rotating `JWT_SECRET` signs everyone out within 15 minutes. Rotating `SESSION_SECRET`
  invalidates all refresh tokens and outstanding codes.
- Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Audit log

Security-relevant events are written to `audit_logs`: registration, lockouts, password changes and
resets, settings changes, and the super-admin seed. Admin actions are added in Phase 10.
