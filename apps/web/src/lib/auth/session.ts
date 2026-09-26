import 'server-only';
import type { MeDto } from '@seshakart/types';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '../api/errors';
import { serverApi } from '../api/server';

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<MeDto | null> => {
  try {
    return (await serverApi<MeDto>('/auth/me')).data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
});

/** For protected pages: the user, or a redirect to sign in (returning here afterwards). */
export async function requireUser(returnTo: string): Promise<MeDto> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}
