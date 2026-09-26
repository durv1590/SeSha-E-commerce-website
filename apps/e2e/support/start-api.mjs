// Starts the API for an end-to-end run on a database of its own:
//  1. creates a NEW database with a unique name (seshakart_e2e_<id>) on the server that
//     DATABASE_URL points to, and records the name for teardown,
//  2. applies the migrations (non-destructive `migrate deploy`) and seeds settings, the
//     e2e admin and the demo catalogue,
//  3. empties the e2e Redis DB and runs the built API (dist/).
// Nothing existing is ever reset or dropped. When Playwright stops this process (SIGTERM),
// the API is stopped first and then only the database this run created is dropped
// (E2E_KEEP_DATABASE=1 keeps it for debugging). A run that is killed outright leaves its
// database behind; see docs/TESTING.md for cleaning those up.
// Environment comes from support/env.ts via playwright.config.ts.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const api = join(import.meta.dirname, '..', '..', 'api');
const requireApi = createRequire(join(api, 'package.json'));

const name = `seshakart_e2e_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const server = new URL(process.env.DATABASE_URL);
const { PrismaClient } = requireApi('@prisma/client');
const admin = new PrismaClient({ datasourceUrl: server.toString() });
await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
await admin.$disconnect();

const url = new URL(server);
url.pathname = `/${name}`;
url.search = '';
const env = { ...process.env, DATABASE_URL: url.toString() };
console.log(`e2e: database ${name}`);

const run = (args, label) => {
  const r = spawnSync(process.execPath, args, { cwd: api, stdio: 'inherit', env });
  if (r.status !== 0) {
    console.error(`e2e: ${label} failed`);
    process.exit(1);
  }
};
run(['./node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrations');
run(['dist/database/seed.js'], 'seed');
run(['dist/database/seed-demo.js'], 'demo seed');

const Redis = requireApi('ioredis');
const redis = new Redis(process.env.REDIS_URL);
await redis.flushdb();
await redis.quit();

async function cleanUp() {
  if (process.env.E2E_KEEP_DATABASE === '1') {
    console.log(`e2e: keeping database ${name}`);
    return;
  }
  const client = new PrismaClient({ datasourceUrl: server.toString() });
  try {
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await client.$disconnect();
  }
  rmSync(process.env.MEDIA_LOCAL_DIR, { recursive: true, force: true });
}

const child = spawn(process.execPath, ['dist/main.js'], { cwd: api, stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill('SIGTERM'));
child.on('exit', async (code) => {
  try {
    await cleanUp();
  } catch (err) {
    console.error(`e2e: could not drop ${name}: ${err.message}`);
  }
  process.exit(code ?? 0);
});
