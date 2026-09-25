/**
 * Builds the PROVISIONAL SeShaKart logo set (concept "01 · Smart S") from the brand board.
 *
 * The board is a low-resolution presentation image, so these assets are temporary
 * placeholders until the approved master vector logo (SVG) is supplied. When it is,
 * replace the outputs and delete this script.
 *
 * Usage (repo root):  pnpm brand:assets
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', '..');
const src = path.join(__dirname, '..', 'seshakart-brand-reference.png');
const masterDir = __dirname;
const publicDir = path.join(root, 'apps', 'web', 'public', 'brand');
const appDir = path.join(root, 'apps', 'web', 'src', 'app');

const NAVY = { r: 13, g: 27, b: 42, alpha: 1 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** Crop a region, upscale it and knock the light-grey board background out to alpha. */
async function cutout(region, scale) {
  const { data, info } = await sharp(src)
    .extract(region)
    .resize({ width: region.width * scale, kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    data[i + 3] = Math.round(Math.max(0, Math.min(1, (d - 14) / 40)) * 255);
  }
  return sharp(data, { raw: info }).trim({ threshold: 1 }).png().toBuffer();
}

/**
 * Reversed version for dark surfaces: navy ink becomes white, orange is preserved.
 * Only rows from `fromRow` down are touched so the full-colour S icon is never altered.
 */
async function reverse(buffer, fromRow = 0) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  for (let i = fromRow * info.width * 4; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const isOrange = r > 170 && r > b + 60;
    if (!isOrange && r < 140 && g < 150) {
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function height(buffer, h) {
  return sharp(buffer).resize({ height: h }).png().toBuffer();
}

/** Icon + wordmark side by side (the lockup used in headers). */
async function horizontal(icon, wordmark, { reversed = false } = {}) {
  if (reversed) wordmark = await reverse(wordmark);
  const H = 240;
  const i = await height(icon, H);
  const w = await height(wordmark, Math.round(H * 0.42));
  const iw = (await sharp(i).metadata()).width;
  const ww = (await sharp(w).metadata()).width;
  const gap = Math.round(H * 0.12);
  const wh = (await sharp(w).metadata()).height;
  return sharp({ create: { width: iw + gap + ww, height: H, channels: 4, background: CLEAR } })
    .composite([
      { input: i, left: 0, top: 0 },
      { input: w, left: iw + gap, top: Math.round((H - wh) / 2) + Math.round(H * 0.04) },
    ])
    .png()
    .toBuffer();
}

/** Square app icon: the S mark centred on a solid rounded tile. */
async function appIcon(icon, size, background, { rounded = true, padding = 0.18 } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(icon)
    .resize({ width: inner, height: inner, fit: 'contain', background: CLEAR })
    .png()
    .toBuffer();
  const r = rounded ? Math.round(size * 0.22) : 0;
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="rgb(${background.r},${background.g},${background.b})"/></svg>`,
  );
  return sharp(tile)
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer();
}

function write(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return file;
}

(async () => {
  const stacked = await cutout({ left: 30, top: 94, width: 122, height: 111 }, 4);
  const icon = await cutout({ left: 58, top: 92, width: 64, height: 73 }, 6);
  const wordmark = await cutout({ left: 30, top: 170, width: 122, height: 23 }, 6);
  const horiz = await horizontal(icon, wordmark);
  // The icon occupies roughly the top two thirds of the stacked lockup.
  const stackedHeight = (await sharp(stacked).metadata()).height;

  const outputs = {
    'logo/seshakart-logo-stacked-provisional.png': stacked,
    'logo/seshakart-logo-stacked-reversed-provisional.png': await reverse(
      stacked,
      Math.round(stackedHeight * 0.66),
    ),
    'logo/seshakart-logo-horizontal-provisional.png': horiz,
    'logo/seshakart-logo-horizontal-reversed-provisional.png': await horizontal(icon, wordmark, {
      reversed: true,
    }),
    'logo/seshakart-icon-provisional.png': icon,
    'logo/seshakart-wordmark-provisional.png': wordmark,
    'logo/seshakart-wordmark-reversed-provisional.png': await reverse(wordmark),
    'app/app-icon-dark-512.png': await appIcon(icon, 512, NAVY),
    'app/app-icon-light-512.png': await appIcon(icon, 512, WHITE),
    'app/app-icon-dark-192.png': await appIcon(icon, 192, NAVY),
    'app/app-icon-maskable-512.png': await appIcon(icon, 512, NAVY, {
      rounded: false,
      padding: 0.24,
    }),
  };

  for (const [name, buffer] of Object.entries(outputs)) {
    if (name.startsWith('logo/')) write(path.join(masterDir, path.basename(name)), buffer);
    write(path.join(publicDir, name), buffer);
  }

  // Next.js metadata icons (favicon + Apple touch icon).
  const favicon = await sharp(icon)
    .resize({ width: 88, height: 88, fit: 'contain', background: CLEAR })
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: CLEAR })
    .png()
    .toBuffer();
  write(path.join(appDir, 'icon.png'), favicon);
  write(
    path.join(appDir, 'apple-icon.png'),
    await appIcon(icon, 180, WHITE, { rounded: false, padding: 0.12 }),
  );

  console.log(`Wrote ${Object.keys(outputs).length + 2} brand assets.`);
})();
