# SeShaKart brand assets

| File                                                      | Purpose                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `seshakart-brand-reference.png`                           | **Primary visual brand reference** (presentation board)                     |
| `logo/seshakart-logo-horizontal-provisional.png`          | Selected logo, concept **01 "Smart S"**: icon beside the wordmark           |
| `logo/seshakart-logo-horizontal-reversed-provisional.png` | Same, with a white wordmark for dark surfaces                               |
| `logo/seshakart-logo-stacked-provisional.png`             | Icon, wordmark and tagline stacked                                          |
| `logo/seshakart-logo-stacked-reversed-provisional.png`    | Stacked version for dark surfaces                                           |
| `logo/seshakart-icon-provisional.png`                     | "Smart S" icon only                                                         |
| `logo/seshakart-wordmark(-reversed)-provisional.png`      | "SeShaKart" wordmark only                                                   |
| `logo/extract-provisional-logo.js`                        | Reproducible build of all of the above plus app icons (`pnpm brand:assets`) |

The script also writes web copies to `apps/web/public/brand/{logo,app}/` and the favicon and
Apple touch icon to `apps/web/src/app/`.

## ⚠️ Provisional logo

The approved logo is concept **01 · Smart S**: an S letter combined with shopping, movement and growth.
No master vector file exists yet, so the files above are **cropped from the low-resolution
presentation board** and upscaled. Known limitations:

- They are soft when displayed larger than roughly 120 px tall.
- The reversed versions are made by recolouring the navy text to white, so a faint halo can
  appear around the icon on very dark backgrounds.

**Action for the brand owner:** supply the master logo as **SVG** (or a 2000 px+ transparent PNG).
Supply at least the full logo, the icon only, and a reversed (white) version. Replace the
`*-provisional.png` files. Only the file names in `apps/web/src/components/brand/Logo.tsx` need updating.

Full brand rules (colour, typography, clear space, minimum sizes, components) are in
[`docs/BRAND_DESIGN_SYSTEM.md`](../docs/BRAND_DESIGN_SYSTEM.md).
