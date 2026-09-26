// Fails (exit 2) when prisma/schema.prisma and the migrations disagree.
//
// SHADOW_DATABASE_URL may live in the repository-root .env. The previous npm script
// expanded "$SHADOW_DATABASE_URL" in the shell *before* node loaded .env, so the check
// silently ran with an empty URL unless the variable was exported.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');
const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
  console.error('SHADOW_DATABASE_URL is not set (see docs/ENVIRONMENT.md).');
  process.exit(1);
}
const { status } = spawnSync(
  process.execPath,
  [
    './node_modules/prisma/build/index.js',
    'migrate',
    'diff',
    '--from-migrations',
    'prisma/migrations',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--shadow-database-url',
    shadow,
    '--exit-code',
  ],
  { stdio: 'inherit' },
);
process.exit(status ?? 1);
