/**
 * Generates clearly labelled DEMO product and category images from Lucide line
 * icons (MIT licensed), in brand-token colours. They exist so layouts can be
 * reviewed realistically; real product photography replaces them before launch.
 */
import sharp from 'sharp';

// Brand token colours (see packages/ui/src/tokens.ts).
const T = {
  primary: '#0B5FFF',
  primaryLight: '#E8F0FF',
  accent: '#FF8A00',
  accentLight: '#FFF3E5',
  navy: '#0D1B2A',
  successLight: '#E6F9EE',
  successText: '#007A33',
  errorLight: '#FEEDEC',
  warningLight: '#FFF6E0',
  muted: '#5B6B7F',
};

export type Palette = { bg: string; bg2: string; ink: string; accent: string };

/** One palette per top-level category, all from design tokens. */
export const PALETTES: Record<string, Palette> = {
  electronics: { bg: T.primaryLight, bg2: '#FFFFFF', ink: T.primary, accent: T.accent },
  fashion: { bg: T.accentLight, bg2: '#FFFFFF', ink: T.navy, accent: T.accent },
  'home-kitchen': { bg: T.successLight, bg2: '#FFFFFF', ink: T.navy, accent: T.successText },
  beauty: { bg: T.errorLight, bg2: '#FFFFFF', ink: T.navy, accent: T.accent },
  'sports-fitness': { bg: T.warningLight, bg2: '#FFFFFF', ink: T.navy, accent: T.primary },
};

function iconInner(svg: string): string {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

export async function productImage(
  iconSvg: string,
  palette: Palette,
  view: 0 | 1,
): Promise<Buffer> {
  const S = 1000;
  const inner = iconInner(iconSvg);
  const icon =
    view === 0
      ? `<g transform="translate(250 210) scale(20.8)" fill="none" stroke="${palette.ink}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
      : `<circle cx="600" cy="420" r="210" fill="${palette.accent}" opacity="0.14"/>
         <g transform="translate(330 240) rotate(-12 170 170) scale(15)" fill="none" stroke="${palette.ink}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="${palette.bg2}"/><stop offset="1" stop-color="${palette.bg}"/></radialGradient></defs>
    <rect width="${S}" height="${S}" fill="url(#g)"/>
    <ellipse cx="500" cy="${view === 0 ? 800 : 780}" rx="${view === 0 ? 260 : 220}" ry="26" fill="${T.navy}" opacity="0.08"/>
    ${icon}
    <text x="500" y="945" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" letter-spacing="4" fill="${T.muted}" opacity="0.8">DEMO IMAGE</text>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

export async function categoryImage(iconSvg: string, palette: Palette): Promise<Buffer> {
  const S = 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <rect width="${S}" height="${S}" fill="${palette.bg}"/>
    <g transform="translate(100 100) scale(8.33)" fill="none" stroke="${palette.ink}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${iconInner(iconSvg)}</g>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}
