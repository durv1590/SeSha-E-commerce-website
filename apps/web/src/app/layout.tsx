import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.seshakart.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'SeShaKart — Smart Shopping, Better Living', template: '%s | SeShaKart' },
  description:
    'SeShaKart is a modern Indian online store — more choices, more value, fast delivery.',
  applicationName: 'SeShaKart',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
