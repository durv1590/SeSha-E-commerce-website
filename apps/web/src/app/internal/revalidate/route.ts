import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED = new Set(['catalog', 'settings']);

function secretMatches(given: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || expected.length < 32 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the API (private network) after admin changes, so cached catalogue and
 * settings data are refreshed at once. Requires the shared secret; only known tags.
 */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get('x-revalidate-secret')))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string' && ALLOWED.has(t))
    : [];
  for (const tag of tags) revalidateTag(tag);
  return NextResponse.json({ revalidated: tags });
}
