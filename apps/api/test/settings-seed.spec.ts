import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { verifyPassword } from '../src/common/security/password';
import { truncateAll } from './helpers/db';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

function runSeed(env: Record<string, string>) {
  // Runs the TypeScript seed through SWC, exactly as `pnpm db:seed` runs the compiled one.
  return execFileSync(
    process.execPath,
    ['-r', '@swc-node/register', join(__dirname, '../src/database/seed.ts')],
    {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, ...env },
      encoding: 'utf8',
    },
  );
}

describe('base seed (integration)', () => {
  beforeAll(() => truncateAll(prisma));
  afterAll(() => prisma.$disconnect());

  const env = { SEED_ADMIN_EMAIL: 'Owner@SeShaKart.com', SEED_ADMIN_PASSWORD: 'Str0ng-Passw0rd' };

  it('creates default settings and a super admin with an argon2 hash', async () => {
    runSeed(env);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@seshakart.com' } });
    expect(admin.role).toBe('SUPER_ADMIN');
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(admin.passwordHash!, 'Str0ng-Passw0rd')).toBe(true);
    const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    expect(settings.map((s) => s.key)).toEqual(['commerce', 'search', 'shipping', 'store']);
    expect(settings[0]!.value).toMatchObject({ freeShippingThreshold: 49900, codEnabled: true });
  });

  it('is idempotent and never overwrites an existing password', async () => {
    runSeed({ ...env, SEED_ADMIN_PASSWORD: 'Different-Passw0rd' });
    const admins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' } });
    expect(admins).toHaveLength(1);
    expect(await verifyPassword(admins[0]!.passwordHash!, 'Str0ng-Passw0rd')).toBe(true);
  });

  it('rejects a weak admin password', () => {
    expect(() =>
      runSeed({ SEED_ADMIN_EMAIL: 'x@seshakart.com', SEED_ADMIN_PASSWORD: 'weak' }),
    ).toThrow();
  });
});
