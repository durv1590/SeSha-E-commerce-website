import { getPublicSettings } from '@/lib/settings/public';
import { absoluteUrl } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

/**
 * RFC 9116 security contact, so researchers know where to report a vulnerability.
 * The contact follows the support email in Admin → Settings; the expiry rolls forward.
 */
export async function GET() {
  const { supportEmail } = await getPublicSettings();
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const body = [
    `Contact: mailto:${supportEmail}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en, hi',
    `Canonical: ${absoluteUrl('/.well-known/security.txt')}`,
    `Policy: ${absoluteUrl('/pages/privacy-policy')}`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
