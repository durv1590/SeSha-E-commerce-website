import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_PORT, WEB_URL, apiEnv, webEnv } from './support/env';

/**
 * End-to-end tests against the real stack: production web build (next start), built API,
 * PostgreSQL and Redis. `pnpm test:e2e` from the repository root after `pnpm build`.
 * Each run gets a new, seeded database that is dropped afterwards (support/start-api.mjs).
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  // Journeys share one database: they create their own customers and orders, but run
  // one file at a time so admin assertions on queues stay predictable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      // Phone layout for the journeys customers mostly take on phones.
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
  ],
  webServer: [
    {
      command: 'node support/start-api.mjs',
      url: `${API_URL}/api/health`,
      env: apiEnv,
      timeout: 240_000,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      stdout: 'pipe',
      // Lets start-api.mjs stop the API and drop the run's database.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
    },
    {
      command: 'node support/start-web.mjs',
      url: `${WEB_URL}/robots.txt`,
      env: { ...webEnv, PORT: String(WEB_PORT) },
      // Includes a production build of the storefront pointed at the e2e API.
      timeout: 360_000,
      reuseExistingServer: process.env.E2E_REUSE === '1',
    },
  ],
});
