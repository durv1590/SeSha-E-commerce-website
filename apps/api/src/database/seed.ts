/**
 * Idempotent base seed — safe to run on every deploy.
 *
 *   pnpm db:seed
 *
 * Creates default settings (only when absent) and the first SUPER_ADMIN from
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. It never overwrites an existing
 * admin's password and never inserts fake customers, orders or reviews.
 * Demo catalogue data is seeded separately (Phase 5: `pnpm db:seed:demo`).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Prisma, PrismaClient } from '@prisma/client';
import { emailSchema, passwordSchema, SETTINGS_SCHEMAS } from '@seshakart/validation';
import { hashPassword } from '../common/security/password';

const rootEnv = join(__dirname, '..', '..', '..', '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const prisma = new PrismaClient();

async function seedSettings(): Promise<void> {
  for (const [key, schema] of Object.entries(SETTINGS_SCHEMAS)) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (existing) continue;
    await prisma.setting.create({
      data: { key, value: schema.parse({}) as Prisma.InputJsonValue },
    });
    console.log(`  settings.${key}: defaults created`);
  }
}

async function seedSuperAdmin(): Promise<void> {
  const rawEmail = process.env.SEED_ADMIN_EMAIL;
  const rawPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!rawEmail || !rawPassword) {
    const msg = 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping super admin.';
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    console.warn(`  ${msg}`);
    return;
  }
  const email = emailSchema.parse(rawEmail);
  const password = passwordSchema.safeParse(rawPassword);
  if (!password.success)
    throw new Error(`SEED_ADMIN_PASSWORD: ${password.error.issues[0]?.message}`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'SUPER_ADMIN') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'SUPER_ADMIN' } });
      console.log(`  super admin: promoted existing user ${email}`);
    } else {
      console.log(`  super admin: ${email} already exists (password unchanged)`);
    }
    return;
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: 'SeShaKart Admin',
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(password.data),
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: 'user.super_admin_seeded',
      entityType: 'user',
      entityId: user.id,
    },
  });
  console.log(`  super admin: created ${email}`);
}

async function main(): Promise<void> {
  console.log('Seeding base data…');
  await seedSettings();
  await seedSuperAdmin();
  console.log('Done.');
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
