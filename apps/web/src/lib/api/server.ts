import 'server-only';
import type { PaginationMeta } from '@seshakart/types';
import { cookies } from 'next/headers';
import { ApiError } from './errors';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

interface Options {
  /** Forward the visitor's cookies (needed for personal data). Default true. */
  auth?: boolean;
  /** Next.js data-cache revalidation in seconds for public data; default no-store. */
  revalidate?: number;
  tags?: readonly string[];
}

/**
 * Server-side API client for Server Components and route handlers. Talks to the API
 * over the internal network and forwards the visitor's cookies for personal data.
 */
export async function serverApi<T>(
  path: string,
  opts: Options = {},
): Promise<{ data: T; meta?: PaginationMeta }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.auth !== false) {
    const jar = await cookies();
    const forwarded = jar
      .getAll()
      .filter((c) => c.name.startsWith('sk_'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    if (forwarded) headers.Cookie = forwarded;
  }
  let res: Response;
  try {
    res = await fetch(`${API}/api${path}`, {
      headers,
      ...(opts.revalidate !== undefined && opts.auth === false
        ? { next: { revalidate: opts.revalidate, tags: opts.tags ? [...opts.tags] : undefined } }
        : { cache: 'no-store' }),
    });
  } catch {
    throw new ApiError(
      503,
      'API_UNAVAILABLE',
      'SeShaKart is temporarily unavailable. Please try again shortly.',
    );
  }
  if (!res.ok) throw await ApiError.fromResponse(res);
  return (await res.json()) as { data: T; meta?: PaginationMeta };
}
