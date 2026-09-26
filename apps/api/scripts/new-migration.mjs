#!/usr/bin/env node
/**
 * Creates a migration from the difference between prisma/migrations and
 * schema.prisma — non-interactive, so it works in CI, containers and agents
 * (unlike `prisma migrate dev`). Review the generated SQL, add any hand-written
 * constraints, then apply with `pnpm db:deploy`.
 *
 *   pnpm db:new add_wishlist_notes
 *
 * Requires SHADOW_DATABASE_URL (an empty scratch database).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: pnpm db:new <snake_case_name>');
  process.exit(1);
}
const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
  console.error('SHADOW_DATABASE_URL is required (an empty scratch database).');
  process.exit(1);
}
const sql = execFileSync(
  process.execPath,
  [
    join(root, 'node_modules/prisma/build/index.js'),
    'migrate',
    'diff',
    '--from-migrations',
    join(root, 'prisma/migrations'),
    '--to-schema-datamodel',
    join(root, 'prisma/schema.prisma'),
    '--shadow-database-url',
    shadow,
    '--script',
  ],
  { encoding: 'utf8' },
);
if (/^-- This is an empty migration/m.test(sql)) {
  console.log('No schema changes — nothing to do.');
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const dir = join(root, 'prisma/migrations', `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), sql);
console.log(`Created ${dir}/migration.sql — review it, then run pnpm db:deploy`);
