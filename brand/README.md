# SeShaKart brand assets

| File                                          | Purpose                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `seshakart-brand-reference.png`               | **Primary visual brand reference** (presentation board)             |
| `logo/seshakart-logo-stacked-provisional.png` | Selected logo, concept **01 "Smart S"**: icon, wordmark and tagline |
| `logo/seshakart-icon-provisional.png`         | "Smart S" icon only                                                 |
| `logo/seshakart-wordmark-provisional.png`     | "SeShaKart" wordmark only                                           |
| `logo/extract-provisional-logo.js`            | Reproducible script that cuts the above from the board              |

## ⚠️ Provisional logo

The approved logo is concept **01 · Smart S**: an S letter combined with shopping, movement and growth.
No master vector file exists yet, so the files above are **cropped from the low-resolution
presentation board** and upscaled. Known limitations:

- They are soft when displayed larger than roughly 120 px wide.
- They are only suitable for **light backgrounds**. The navy wordmark disappears on dark surfaces.
  Phase 2 adds a light (reversed) variant for the navy header and footer areas.

**Action for the brand owner:** supply the master logo as **SVG** (or a 2000 px+ transparent PNG).
Supply at least the full logo, the icon only, and a reversed (white) version. Replace the
`*-provisional.png` files and the copies in `apps/web/public/brand/logo/`. No code changes are
needed beyond updating file names.

## Brand values extracted from the reference board

| Token         | Value     | RGB           |
| ------------- | --------- | ------------- |
| Primary Blue  | `#0B5FFF` | 11, 95, 255   |
| Accent Orange | `#FF8A00` | 255, 138, 0   |
| Navy          | `#0D1B2A` | 13, 27, 42    |
| Light Gray    | `#F4F7FB` | 244, 247, 251 |
| Success Green | `#00C853` | 0, 201, 83    |

Typography: **Montserrat** (primary / headings), **Inter** (secondary / UI).
Tagline: **"Smart Shopping, Better Living"**.
Alternate taglines: "More Choices. More Value." and "Shop Smart. Live Better."

The complete design system (tokens, components, usage rules) will be documented in
`docs/BRAND_DESIGN_SYSTEM.md` in Phase 2.
