import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The isolated stack the end-to-end tests run against: a new database per run, its own
 * Redis DB, media folder and ports, so a run never touches development data. Everything can be overridden with E2E_* variables.
 */
const root = join(__dirname, '..', '..', '..');
const rootEnv = join(root, '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * A connection to the database server. start-api.mjs creates a fresh, uniquely named
 * database there for each run (and global-teardown.ts drops it again).
 */
function databaseServerUrl(): string {
  return (
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://seshakart:seshakart@localhost:5432/seshakart'
  );
}

export const API_PORT = Number(process.env.E2E_API_PORT ?? 4500);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3500);
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

/** Test-only credentials for a throwaway database; never used anywhere else. */
export const ADMIN = { email: 'e2e-admin@example.com', password: 'E2e-Admin-Passphrase-42' };
const REVALIDATE_SECRET = 'e2e-revalidate-secret-0123456789abcdef';

export const repoRoot = root;

export const apiEnv: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: databaseServerUrl(),
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/6',
  API_PORT: String(API_PORT),
  APP_URL: WEB_URL,
  LOG_LEVEL: 'warn',
  // One browser makes every request from one IP; rate limiting has its own API tests.
  RATE_LIMIT_ENABLED: 'false',
  JWT_SECRET: 'e2e-jwt-secret-0123456789abcdefghijklmnop',
  SESSION_SECRET: 'e2e-session-secret-0123456789abcdefghijkl',
  SMTP_HOST: '',
  SMS_PROVIDER: 'console',
  PAYMENT_PROVIDER: 'mock',
  MEDIA_LOCAL_DIR: join(root, 'apps', 'e2e', '.media'),
  WEB_INTERNAL_URL: WEB_URL,
  REVALIDATE_SECRET,
  SEED_ADMIN_EMAIL: ADMIN.email,
  SEED_ADMIN_PASSWORD: ADMIN.password,
};

export const webEnv: Record<string, string> = {
  API_INTERNAL_URL: API_URL,
  REVALIDATE_SECRET,
};
