/**
 * Extracts the PROVISIONAL SeShaKart logo (concept "01 · Smart S") from the brand board.
 *
 * The board is a low-resolution presentation image, so these crops are temporary
 * placeholders until the approved master vector logo (SVG) is supplied.
 *
 * Usage (from repo root, requires `sharp`):  node brand/logo/extract-provisional-logo.js
 */
const path = require('node:path');
const sharp = require('sharp');

const src = path.join(__dirname, '..', 'seshakart-brand-reference.png');
const out = (name) => path.join(__dirname, name);

// Knock the light-grey board background out to transparency with a soft edge.
async function cutout(region, scale, file) {
  const { data, info } = await sharp(src)
    .extract(region)
    .resize({ width: region.width * scale, kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    data[i + 3] = Math.round(Math.max(0, Math.min(1, (d - 10) / 45)) * 255);
  }
  await sharp(data, { raw: info })
    .trim({ threshold: 1 })
    .png({ compressionLevel: 9 })
    .toFile(out(file));
}

(async () => {
  await cutout(
    { left: 30, top: 94, width: 122, height: 111 },
    4,
    'seshakart-logo-stacked-provisional.png',
  );
  await cutout({ left: 58, top: 92, width: 64, height: 73 }, 6, 'seshakart-icon-provisional.png');
  await cutout(
    { left: 30, top: 170, width: 122, height: 23 },
    6,
    'seshakart-wordmark-provisional.png',
  );
})();
