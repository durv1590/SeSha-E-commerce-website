import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { TEST_DATABASE_URL } from './helpers/test-env';

/** Brings the test database schema up to date before any test runs. */
export default function globalSetup(): void {
  if (!/_test\b|_test\?/.test(TEST_DATABASE_URL)) {
    throw new Error(`Refusing to run tests against a non-test database: ${TEST_DATABASE_URL}`);
  }
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
