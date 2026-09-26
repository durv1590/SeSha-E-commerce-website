# SEO and analytics

How the storefront presents itself to search engines and social networks, and how shopping
behaviour is measured without collecting personal data. Store staff manage page-level SEO in
the admin (see [ADMIN_GUIDE.md](ADMIN_GUIDE.md#content)); this document covers the rest.

## Indexing: which deployments search engines may see

Only the **canonical production host** is indexable: `NEXT_PUBLIC_SITE_URL` must be `https://`
and its host must equal `CANONICAL_HOST` (default `www.seshakart.com`). Every other deployment
(staging, previews, local builds) gets:

- `robots.txt` with `Disallow: /`,
- an empty `sitemap.xml`,
- `<meta name="robots" content="noindex, nofollow">` on every page.

So a staging site that is reachable from the internet still never appears in search results.
Set `ALLOW_INDEXING=false` to switch production off as well (for example before launch).

`NEXT_PUBLIC_SITE_URL` is compiled into the build, so build each environment with its own URL.

## robots.txt and sitemap.xml

- **`/robots.txt`** allows the store and disallows the private areas: `/admin`, `/account`,
  `/cart`, `/checkout`, `/login`, `/register`, `/forgot-password`, `/search` (internal search
  results), `/design-system`, `/internal` and `/api/`. It points to the sitemap.
- **`/sitemap.xml`** is generated per request from the API's `GET /api/sitemap` feed (served from
  Redis, refreshed at least every 15 minutes and immediately after catalogue edits). It lists:
  - the home page and the main listings (all products, categories, deals, best sellers, new
    arrivals, order tracking);
  - every **live** product, with up to five image URLs and its last-modified date;
  - visible categories and brands that have at least one live product (empty listings are thin
    content);
  - published CMS pages.

  Paths an admin marked **Hide from search engines** (Admin → SEO) are left out. The sitemap
  holds up to 45,000 products; beyond that it will need splitting into a sitemap index.

Submit `https://www.seshakart.com/sitemap.xml` in **Google Search Console** and **Bing Webmaster
Tools** after launch.

## Page metadata

Every indexable page sends, through one helper (`pageMetadata()` in `apps/web/src/lib/seo/site.ts`):

- a title (`Page name | SeShaKart`, or an admin override used exactly as written);
- a description (the admin or product SEO fields first, then sensible defaults);
- a **canonical URL**. Filtered and sorted listings point to the unfiltered listing; later pages
  keep their number (`/deals?page=3`), because pointing page 3 at page 1 would hide its
  products. Product links with `?variant=` point to the product;
- a complete **Open Graph** block (site name, `en_IN` locale, URL, title, description, image) and
  a large-image **X (Twitter)** card. Product pages share their first images; other pages use
  the default share image `public/brand/social/og-default.jpg` (1200×630, built from the
  provisional logo; replace it when the final logo is ready).

Admin SEO overrides (Admin → SEO) replace the title, description and share image of any page and
can add `noindex`.

## Structured data (JSON-LD)

| Page                        | Types                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                        | `OnlineStore` (name, legal name, logo, support email and phone), `WebSite` with a `SearchAction` for the sitelinks search box                                              |
| Product                     | `Product` (name, description, SKU, images, brand, category, `Offer` or `AggregateOffer` in INR with availability and return policy, `AggregateRating`, up to five reviews) |
| Product, category, CMS page | `BreadcrumbList`                                                                                                                                                           |

Only facts shown on the page are marked up, as Google requires, and ratings come from approved
reviews only. The JSON is escaped so product text can never close its `<script>` element.
Check pages with Google's **Rich Results Test** after launch.

## Analytics

Two optional tools, each switched on by a build-time variable:

| Variable                    | Tool                       | Purpose (consent category)                                 |
| --------------------------- | -------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_ANALYTICS_ID`  | Google Analytics 4 (`G-…`) | How the store is used (**analytics**)                      |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel (numeric)       | Which Facebook/Instagram ads lead to sales (**marketing**) |

Malformed values are ignored. The security headers allow each tool's origins only when its
variable is set. The variables are compiled into the build, so pass them as build arguments
(`infra/docker/web.Dockerfile`) **and** keep them in the runtime environment.

### Consent

With no tool configured there are no optional cookies and no banner. Otherwise:

- A banner asks once, with **Accept all**, **Reject all** and **Choose** (per purpose) given equal
  weight. It is not a modal: the store stays usable, and it reserves scroll space so it never
  hides the focused element. Nothing loads before a choice.
- The choice is stored in the `sk_consent` cookie (`v1.a1.m0`: analytics yes, marketing no) for
  180 days. Changing `CONSENT_VERSION` asks everyone again, for example after adding a tool.
- **Cookie settings** in the footer reopens the banner. Withdrawing consent deletes the tools'
  cookies (`_ga*`, `_gid`, `_fbp`, `_fbc`) and reloads the page so their scripts are gone.
- The admin never loads analytics.

Update the privacy policy page to describe the tools you enable before turning them on.

### What is sent

No names, emails, phone numbers or addresses are ever sent. Page addresses are cleaned first:
only listing, search and campaign parameters (`q`, filters, `sort`, `page`, `variant`, `utm_*`,
`gclid`, `fbclid`) are kept, and order numbers in account URLs are replaced with `[order]`. The
Meta Pixel always reports the real address, so it sends nothing from a page whose address carries
a token-like parameter. Its automatic button and metadata collection is switched off.

| Store event                                  | GA4                 | Meta                                 |
| -------------------------------------------- | ------------------- | ------------------------------------ |
| Every page, including in-app navigation      | `page_view`         | `PageView`                           |
| Product page                                 | `view_item`         | `ViewContent`                        |
| Add to cart                                  | `add_to_cart`       | `AddToCart`                          |
| Checkout opened                              | `begin_checkout`    | `InitiateCheckout`                   |
| Order confirmed (once per order and browser) | `purchase`          | `Purchase` (event ID = order number) |
| Search results                               | `search`            | `Search`                             |
| Account created / signed in                  | `sign_up` / `login` | `CompleteRegistration` / –           |

Items are identified by the product slug, with the variant name, brand and category where known.
Money is sent in rupees (INR). A prepaid order is reported only once its payment is confirmed.

### Setting up Google Analytics 4

1. Create a GA4 property and a **web data stream** for `https://www.seshakart.com`.
2. In the stream's **Enhanced measurement** settings, open **Page views → Show advanced settings**
   and switch off **Page changes based on browser history events**. The store sends its own page
   views with cleaned addresses; leaving this on double-counts them and reports raw URLs.
3. Under **Data settings → Data collection**, leave Google signals off (the store also disables
   it in code).
4. Set `NEXT_PUBLIC_ANALYTICS_ID=G-XXXXXXX`, rebuild and deploy.
5. Accept analytics cookies on the live site and check **Realtime** / **DebugView**.

### Setting up the Meta Pixel

1. Create a pixel (dataset) in **Events Manager**.
2. In its settings, leave **Automatic advanced matching** off: it would hash and send customer
   emails and phone numbers from forms.
3. Set `NEXT_PUBLIC_META_PIXEL_ID=…`, rebuild and deploy, then check with **Test events**.
4. Purchases carry the order number as `eventID`, so a later server-side Conversions API
   integration can send the same event without double-counting.
