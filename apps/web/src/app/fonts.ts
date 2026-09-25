import { Inter, Montserrat } from 'next/font/google';

/**
 * Brand typefaces, self-hosted at build time by next/font (no runtime request to
 * Google, no layout shift thanks to automatic size-adjusted fallbacks).
 */
export const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
  variable: '--font-heading',
});

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});
