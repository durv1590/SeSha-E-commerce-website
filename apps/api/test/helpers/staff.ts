import type { INestApplication } from '@nestjs/common';
import type { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../../src/common/security/password';
import { browser, type BrowserClient } from './client';

export const STAFF_PASSWORD = 'Tulsi-garden-42';

/** A signed-in staff browser session with the given role. */
export async function staffClient(
  app: INestApplication,
  prisma: PrismaClient,
  role: Role = 'ADMIN',
): Promise<BrowserClient> {
  const email = `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@seshakart.com`;
  await prisma.user.create({
    data: { name: role, email, role, passwordHash: await hashPassword(STAFF_PASSWORD) },
  });
  const c = await browser(app);
  await c.post('/api/auth/login', { identifier: email, password: STAFF_PASSWORD }).expect(200);
  return c;
}
