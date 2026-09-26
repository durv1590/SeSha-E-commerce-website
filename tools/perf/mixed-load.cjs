// Mixed, mostly-uncached storefront traffic against the API (see tools/perf/README.md):
// 30% category listings, 25% product pages, 20% searches (some with typos), 10% search
// suggestions, 10% brand + price filters, 5% homepage. Random pages and filters defeat
// the cache, so this measures the database and API code, not Redis.
//   node tools/perf/mixed-load.cjs <connections>
const autocannon = require('autocannon');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const words = [
  'wireless',
  'smart',
  'classic',
  'premium',
  'eco',
  'ultra',
  'compact',
  'pro',
  'earbuds',
  'kettle',
  'shirt',
  'backpack',
  'serum',
  'speaker',
  'watch',
  'blender',
  'saree',
  'shoes',
];
const typo = (w) => {
  const i = 1 + Math.floor(Math.random() * (w.length - 2));
  return w.slice(0, i) + w.slice(i + 1);
};
const sorts = ['popular', 'newest', 'price_asc', 'price_desc', 'discount', 'rating'];
function path() {
  const r = Math.random();
  const n = () => 2 + Math.floor(Math.random() * 9); // roots 2-10 (root 1 holds only drafts)
  const k = (m) => 1 + Math.floor(Math.random() * m);
  if (r < 0.3)
    return `/api/products?category=${pick([`root-${n()}`, `group-${n()}-${k(5)}`, `leaf-${n()}-${k(5)}-${k(4)}`])}&sort=${pick(sorts)}&page=${k(20)}`;
  if (r < 0.55) return `/api/products/product-${1 + Math.floor(Math.random() * 30000)}`;
  if (r < 0.75) {
    const q = `${pick(words)} ${Math.random() < 0.3 ? typo(pick(words)) : pick(words)}`;
    return `/api/products?q=${encodeURIComponent(q)}&page=${1 + Math.floor(Math.random() * 3)}`;
  }
  if (r < 0.85)
    return `/api/search/suggest?q=${pick(words).slice(0, 2 + Math.floor(Math.random() * 4))}`;
  if (r < 0.95)
    return `/api/products?brand=brand-${1 + Math.floor(Math.random() * 300)}&min=${Math.floor(Math.random() * 5000)}`;
  return '/api/home';
}
const inst = autocannon(
  {
    url: process.env.API ?? 'http://localhost:4100',
    connections: +process.argv[2] || 50,
    duration: +(process.env.DURATION ?? 20),
    requests: [{ setupRequest: (req) => ({ ...req, path: path() }) }],
  },
  (err, d) => {
    const l = d.latency;
    console.log(
      `mixed c=${process.argv[2] || 50}: ${d.requests.average.toFixed(0)} req/s  p50 ${l.p50} ms  p90 ${l.p90} ms  p99 ${l.p99} ms  max ${l.max} ms  non2xx ${d.non2xx} errors ${d.errors}`,
    );
  },
);
