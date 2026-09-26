import 'server-only';
import { serverApi } from '../api/server';

export interface PublicSettings {
  storeName: string;
  legalName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  freeShippingThreshold: number;
  codEnabled: boolean;
}

/** Used only if the API is unreachable (e.g. during a static build). */
const FALLBACK: PublicSettings = {
  storeName: 'SeShaKart',
  legalName: 'SeShaKart Pvt. Ltd.',
  tagline: 'Smart Shopping, Better Living',
  supportEmail: 'durvesh15aug@gmail.com',
  supportPhone: '8218397819',
  freeShippingThreshold: 49_900,
  codEnabled: true,
};

/** Admin-managed store settings (cached for 60 s in the Next.js data cache). */
export async function getPublicSettings(): Promise<PublicSettings> {
  // During `next build` the API may not be running; static pages start from the
  // fallback and pick up real settings on the first revalidation (≤ 60 s).
  if (process.env.NEXT_PHASE === 'phase-production-build') return FALLBACK;
  try {
    return (
      await serverApi<PublicSettings>('/settings/public', {
        auth: false,
        revalidate: 60,
        tags: ['settings'],
      })
    ).data;
  } catch {
    return FALLBACK;
  }
}

export function formatPhone(tenDigits: string): string {
  return `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`;
}
