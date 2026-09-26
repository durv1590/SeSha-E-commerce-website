import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { colors } from '@seshakart/ui/tokens';
import { inter, interRupee, montserrat, montserratRupee } from './fonts';
import { DEFAULT_OG_IMAGE, isIndexable, SITE_NAME, siteUrl } from '@/lib/seo/site';
import './globals.css';

const DEFAULT_TITLE = 'SeShaKart — Smart Shopping, Better Living';
const DEFAULT_DESCRIPTION =
  'SeShaKart is a modern Indian online store — more choices, more value, fast delivery.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  // Pages that set their own openGraph replace this block (see pageMetadata()).
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_IN',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  // X falls back to the Open Graph title, description and image.
  twitter: { card: 'summary_large_image' },
  // Staging and preview hosts are never indexed, whatever a page says.
  ...(isIndexable() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: colors.navy,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page is rendered per request: the script nonce in the Content-Security-Policy
  // (src/middleware.ts) is new each time, and a prerendered page would carry none.
  await connection();
  return (
    <html
      lang="en-IN"
      className={`${montserrat.variable} ${montserratRupee.variable} ${inter.variable} ${interRupee.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
