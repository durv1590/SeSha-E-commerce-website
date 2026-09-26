import 'server-only';
import type { MeDto, Permission } from '@seshakart/types';
import { STAFF_ROLES } from '@seshakart/types';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from './session';

/**
 * Admin pages: signed-in staff only. Customers get a 404 (the admin area isn't
 * advertised); a missing permission is a 404 too. The API enforces the same rules on
 * every call; this only decides what to render.
 */
export async function requireStaff(returnTo: string, permission?: Permission): Promise<MeDto> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!STAFF_ROLES.includes(user.role)) notFound();
  if (permission && !user.permissions.includes(permission)) notFound();
  return user;
}
