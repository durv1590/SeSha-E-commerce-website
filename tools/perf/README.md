# Performance testing

Tools used in Phase 12 to find bottlenecks with a realistic amount of data. Results and
the fixes they led to are in [docs/PERFORMANCE.md](../../docs/PERFORMANCE.md).

**Always use a scratch database.** `seed.sql` fills tables directly.

```bash
# 1. Scratch database with the current schema
createdb seshakart_perf
PERF_URL=postgresql://seshakart:<password>@localhost:5432/seshakart_perf
DATABASE_URL=$PERF_URL pnpm --filter @seshakart/api prisma:deploy

# 2. ~250 MB of synthetic data (30k products, 100k orders; about a minute)
psql "$PERF_URL" -v ON_ERROR_STOP=1 -f tools/perf/seed.sql

# 3. A second API on :4100 against it: its own Redis DB, no rate limit (load test only),
#    slow queries logged from 50 ms
cd apps/api && DATABASE_URL="$PERF_URL?connection_limit=20" REDIS_URL=redis://localhost:6379/5 \
  API_PORT=4100 RATE_LIMIT_ENABLED=false DB_SLOW_QUERY_MS=50 node --env-file=../../.env dist/main.js

# 4. Load (autocannon is not a project dependency; install it anywhere, e.g. a temp dir)
npm i --prefix /tmp/perf autocannon@8
NODE_PATH=/tmp/perf/node_modules node tools/perf/mixed-load.cjs 50
```

Flush the perf Redis DB (`redis-cli -n 5 flushdb`) before each run for cold-cache numbers.
Add `--cpu-prof` to the API's `node` command to profile it under load. Drop the database
afterwards (`dropdb seshakart_perf`).
