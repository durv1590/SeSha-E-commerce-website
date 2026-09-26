// Builds (unless E2E_SKIP_BUILD=1 and a build exists) and starts the storefront for an
// end-to-end run, in its own folder (.next-e2e). The browser's /api rewrite is fixed at
// build time, so this build must point at the e2e API; the normal .next build is untouched.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const web = join(import.meta.dirname, '..', '..', 'web');
const next = createRequire(join(web, 'package.json')).resolve('next/dist/bin/next');
const distDir = '.next-e2e';
const env = { ...process.env, NEXT_DIST_DIR: distDir };

if (!(process.env.E2E_SKIP_BUILD === '1' && existsSync(join(web, distDir, 'BUILD_ID')))) {
  const { NODE_ENV: _omit, ...buildEnv } = env; // `next build` must choose NODE_ENV itself
  const r = spawnSync(process.execPath, [next, 'build'], {
    cwd: web,
    stdio: 'inherit',
    env: buildEnv,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const child = spawn(process.execPath, [next, 'start', '-p', process.env.PORT], {
  cwd: web,
  stdio: 'inherit',
  env: { ...env, NODE_ENV: 'production' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
