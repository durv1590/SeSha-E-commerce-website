# Performance

How SeShaKart was measured, what was found and fixed in Phase 12, and what to watch as the
catalogue and traffic grow. The tooling is in [tools/perf](../tools/perf/README.md).

## Method

The demo catalogue (about 60 products) hides every scaling problem, so measurements used a
scratch database filled with synthetic data (`tools/perf/seed.sql`):

| Data                  | Rows              |
| --------------------- | ----------------- |
| Categories (3 levels) | 260               |
| Brands                | 300               |
| Products (90 % live)  | 30,000            |
| Variants, with stock  | 60,000            |
| Customers             | 20,000            |
| Orders / order items  | 100,000 / 200,000 |
| Approved reviews      | 40,000            |

- **API:** one Node.js process, 20 database connections, Redis cache. Cold latency with the
  cache flushed before each request; load with [autocannon](https://github.com/mcollina/autocannon)
  at 50 connections. The load generator shared the same 4 CPU cores, so absolute numbers are
  conservative.
- **Mixed traffic** (`tools/perf/mixed-load.cjs`): random category listings, product pages,
  searches (some with typos), suggestions, brand/price filters and the homepage. Random pages
  and filters defeat the cache: it measures the database and API code, a worst case.
- **Web:** Chromium with a phone profile (360 px, 4× CPU slowdown, "slow 4G": 150 ms RTT,
  1.6 Mbps), median of 3–5 loads.

## Results

### API

| Measure (30k products, cache cold)          | Before               | After                 |
| ------------------------------------------- | -------------------- | --------------------- |
| Mixed uncached traffic, one process         | 64 req/s, p50 637 ms | 216 req/s, p50 161 ms |
| Same, corrected generator (every URL valid) | –                    | 155 req/s, p50 316 ms |
| Search with a typo: vocabulary lookup       | ~170 ms              | ~6 ms                 |
| Search with no match: fuzzy fallback        | 74 ms                | 0.1 ms                |
| Listing facets over the whole catalogue     | 31 ms                | 7 ms                  |

The first generator also sent some URLs for categories that don't exist (cheap 404s) in both
runs; the corrected one requests only real pages, hence the lower but more realistic figure.

Per request type, uncached, 20 connections, after the fixes:

| Type                           | Throughput  | p50    | p99    |
| ------------------------------ | ----------- | ------ | ------ |
| Category listing (random page) | 160 req/s   | 128 ms | 246 ms |
| Product page                   | 436 req/s   | 47 ms  | 85 ms  |
| Search                         | 119 req/s   | 170 ms | 406 ms |
| Search with typos              | 67 req/s    | 306 ms | 460 ms |
| Brand + price filter           | 100 req/s   | 195 ms | 386 ms |
| Search suggestions             | 2,840 req/s | 5 ms   | 13 ms  |

With a warm cache (repeat visitors, popular pages) the same process serves 1,500–4,000 req/s
with p99 ≤ 60 ms. Admin endpoints over 100,000 orders answer in under 100 ms cold, except a
full financial-year sales report (~0.5 s) and admin product text search (~0.2 s).

### Web (phone profile)

| Page     | LCP   | CLS   | TBT     | HTML (gzip) | JS (gzip) |
| -------- | ----- | ----- | ------- | ----------- | --------- |
| Home     | 1.1 s | 0.001 | ~700 ms | 109 KB      | 150 KB    |
| Listing  | 0.9 s | 0.001 | ~400 ms | 61 KB       | 178 KB    |
| Category | 0.8 s | 0     | ~300 ms | 50 KB       | 178 KB    |
| Product  | 0.8 s | 0     | ~230 ms | 30 KB       | 189 KB    |

Largest Contentful Paint and layout shift are well inside Google's "good" thresholds
(2.5 s, 0.1). Total Blocking Time is mostly the framework itself (Next.js runtime and React
DOM, ~100 KB gzip) plus hydrating every product card. The home page, with several rails of up to
12 cards (51 cards in the demo), is the heaviest. Keeping homepage rails to 8 products each (Admin → Content → Homepage)
is the simplest lever if field data shows slow interaction on low-end phones. Splitting the
rails into separate Suspense boundaries was tried and made no measurable difference.

With the 30k-product data, page HTML shrank by 20–45 % (for example `/products` 947 KB →
509 KB, 82 KB gzipped).

## What was fixed

1. **Typo-correction vocabulary** was rebuilt from every live product on each search. It is
   now a materialised view (`search_vocab`) with a trigram GiST index, refreshed after catalogue
   changes (`SearchService.ensureVocabulary`, at most every 10 minutes otherwise; concurrent,
   so searches never wait for it).
2. **Fuzzy fallback** now uses the product-name trigram index (`<%` operator).
3. **Hot cached values** (category tree, brands, settings) were JSON-parsed from Redis several
   times per request: 41 % of API CPU under load. `CacheService.wrap(..., { localSeconds })`
   keeps them parsed in-process for up to 10 s (deep-frozen; cleared on this instance at once
   by catalogue/settings changes; other instances may lag by up to 10 s).
4. **Listing facets** are index-only scans (`products_listing_facets_idx`).
5. **Page weight:**
   - The root 404 page no longer includes the full header: Next.js embeds it in every page's
     payload, so each page carried a second copy of the header and category tree.
   - The mobile menu receives only the fields it shows.
   - The desktop menu lists at most 6 sub-categories per group (then "View all").
   - Listings show the 20 brands with most products (plus any selected) and a "Show all
     brands" link.

## Scaling

- **API:** stateless (cache and rate limits in Redis), so run one process per CPU core (more
  replicas) behind nginx. Size `connection_limit` so that replicas × limit stays below
  PostgreSQL's `max_connections` (or put PgBouncer in front).
- **Search:** PostgreSQL full-text search is comfortable into the tens of thousands of
  products. Beyond ~100,000, or for semantic search, implement the `SearchEngine` interface
  with a dedicated engine.
- **Sitemap:** a single file holds up to 45,000 products; beyond that, split it into a sitemap
  index.
- **Watch:** the API logs every query slower than `DB_SLOW_QUERY_MS` (250 ms by default).
