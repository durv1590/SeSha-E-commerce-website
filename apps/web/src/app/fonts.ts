import localFont from 'next/font/local';

/**
 * Brand typefaces, self-hosted from the repository (SIL OFL 1.1, licences in ./fonts),
 * so builds never depend on reaching Google Fonts.
 *
 * Each family = a preloaded Latin variable font + a tiny "rupee" face containing only
 * ₹ (U+20B9), which lives in the Latin-Extended block. Without it every price symbol
 * would fall back to a system font. The rupee face has a unicode-range, so browsers
 * fetch it (~1–4 KB) only when a ₹ is on the page. Regenerate with docs/BRAND_DESIGN_SYSTEM.md §4.
 */
export const montserrat = localFont({
  src: './fonts/montserrat-latin-wght.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-heading',
  preload: true,
});

export const montserratRupee = localFont({
  src: './fonts/montserrat-rupee-wght.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-heading-rupee',
  preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+20B9' }],
  adjustFontFallback: false,
});

export const inter = localFont({
  src: './fonts/inter-latin-wght.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-body',
  preload: true,
});

export const interRupee = localFont({
  src: './fonts/inter-rupee-wght.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-body-rupee',
  preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+20B9' }],
  adjustFontFallback: false,
});
