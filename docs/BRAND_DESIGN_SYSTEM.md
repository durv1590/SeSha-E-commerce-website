# SeShaKart brand design system

**Smart Shopping, Better Living.** This document is the reference for every SeShaKart
touchpoint: website, Android and iOS apps, email, social media, advertising, packaging
and invoices.

- **Source of truth for values:** `packages/ui/src/tokens.ts`. Web code reads it through the
  Tailwind preset. Future apps and email templates can import the same file.
- **Visual reference:** `brand/seshakart-brand-reference.png`. We take the design language
  from this board; we do not copy its layout.
- **Live reference:** `/design-system` in development, or on staging with
  `ENABLE_DESIGN_SYSTEM_PAGE=true`.

---

## 1. Brand personality

Modern · smart · trustworthy · professional · technology-driven · accessible ·
convenient · energetic · premium but not luxury-exclusive · Indian-market friendly.

Every screen should communicate **Smart shopping + Technology + Choice + Convenience + Trust + Growth**.
Products are always the visual focus. Brand colour frames the products and never competes with them.

## 2. Logo

**Approved concept:** 01 · "Smart S". It combines the letter S with shopping, movement and growth.
It is a blue-to-orange swoosh S with a forward arrow, set next to the wordmark
**SeShaKart** ("SeSha" in navy, "Kart" in orange).

| Asset (in `/public/brand/logo/`)                     | Use                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `seshakart-logo-horizontal-provisional.png`          | Headers, email headers, invoices (light backgrounds)               |
| `seshakart-logo-horizontal-reversed-provisional.png` | Navy or dark surfaces: footer, hero, dark app screens              |
| `seshakart-logo-stacked-provisional.png`             | Square placements, packaging, splash screens. Includes the tagline |
| `seshakart-logo-stacked-reversed-provisional.png`    | Stacked version on dark surfaces                                   |
| `seshakart-icon-provisional.png`                     | Favicon, avatars, loading placeholders                             |
| `/public/brand/app/app-icon-*.png`                   | App icons (dark and light tiles), PWA, maskable icon               |

In the web app, always use `<Logo variant tone height />` from
`apps/web/src/components/brand/Logo.tsx`. **Never recreate the logo in CSS, SVG paths or text.**

> ⚠️ **Provisional:** the current files are cropped from the low-resolution board. When the
> master SVG arrives, replace the files and drop the `-provisional` suffix. That is the only
> code change needed. See `brand/README.md`.

### Clear space and minimum size

- **Clear space:** keep a margin on every side equal to the height of the "S" in the wordmark
  (about 0.4 × the icon height). Nothing may enter this zone.
- **Minimum size (digital):** 24 px tall for the horizontal logo, 16 px for the icon alone, and
  64 px tall for the stacked logo (its tagline becomes unreadable below that).
- **Minimum size (print):** 25 mm wide for the horizontal logo, 8 mm for the icon.

### Don'ts

Don't stretch, rotate, recolour, outline or add effects to the logo. Don't place the
default (navy-text) logo on dark backgrounds; use the reversed version. Don't place the
logo on busy photos without a solid panel behind it.

## 3. Colour

| Token                                    | Hex                               | Role                                                                    |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `primary`                                | `#0B5FFF`                         | **Primary Blue.** Links, primary buttons, active states, brand presence |
| `primary-dark`                           | `#0847C2`                         | Hover and pressed states, blue text on tinted surfaces                  |
| `primary-light`                          | `#E8F0FF`                         | Tinted surfaces, selected filters, icon tiles                           |
| `accent`                                 | `#FF8A00`                         | **Accent Orange.** Main CTAs (Add to cart, Buy now), deals, highlights  |
| `accent-dark`                            | `#E67A00`                         | Accent hover                                                            |
| `accent-text`                            | `#B35600`                         | Orange-toned **text** on light surfaces                                 |
| `accent-light`                           | `#FFF3E5`                         | Soft promotional backgrounds                                            |
| `navy`                                   | `#0D1B2A`                         | **Navy.** Headings, body text, hero, footer, secondary buttons          |
| `navy-light`                             | `#1B2F45`                         | Raised elements on navy                                                 |
| `success`                                | `#00C853`                         | **Success Green.** Icons, fills, progress                               |
| `success-text`                           | `#007A33`                         | Green **text**: discounts, "In stock", confirmations                    |
| `warning` / `-text` / `-light`           | `#F5A524` / `#B54708` / `#FFF6E0` | Low stock, cautions                                                     |
| `error` / `-text` / `-light`             | `#D92D20` / `#B42318` / `#FEEDEC` | Errors, destructive actions                                             |
| `background`                             | `#F4F7FB`                         | **Light Gray.** Page background                                         |
| `surface`                                | `#FFFFFF`                         | Cards, inputs, sheets                                                   |
| `surface-muted`                          | `#EEF2F8`                         | Secondary surfaces, skeletons                                           |
| `border` / `border-strong`               | `#DCE3EE` / `#B8C4D6`             | Dividers, card borders, input borders                                   |
| `text-primary` / `-secondary` / `-muted` | `#0D1B2A` / `#3E4C5E` / `#5B6B7F` | Text hierarchy                                                          |

The five brand colours (Primary Blue, Accent Orange, Navy, Light Gray and Success Green)
come straight from the board. All other values are tints, shades or text-safe variants of
them. **Do not introduce colours outside this table**, and never write raw hex values in
components.

**Proportion guide:** mostly light neutrals, then navy text, blue for brand presence, and orange
used sparingly for action. When everything is orange, nothing stands out.

### Accessibility colour rules (WCAG 2.2 AA)

The unit test in `packages/ui/src/tokens.test.ts` checks every approved text and background pairing.

| Pairing                             | Ratio  | Rule                                                                |
| ----------------------------------- | ------ | ------------------------------------------------------------------- |
| White on Primary Blue               | 5.1:1  | ✅ Primary buttons                                                  |
| White on Navy                       | 17.4:1 | ✅ Secondary buttons, dark sections                                 |
| **Navy on Accent Orange**           | 7.4:1  | ✅ **Accent buttons use navy text**                                 |
| White on Accent Orange              | 2.4:1  | ❌ Never use for text                                               |
| White on Success Green              | 2.2:1  | ❌ Never use for text; use `success-text` on light surfaces instead |
| Accent Orange on Navy               | 7.4:1  | ✅ Orange headline words on dark banners                            |
| `text-muted` on white or background | ≥ 5:1  | ✅ Secondary information                                            |

> **Deviation from the board (flagged):** the board shows white text on orange "Shop Now"
> buttons. That fails WCAG AA contrast (2.4:1), and accessibility is a written requirement.
> Orange buttons therefore use **navy text**. They look the same from a distance but are
> readable by everyone. Orange stays the CTA colour, so the brand direction is unchanged.
>
> The board lists Success Green as `#00C853` with RGB `0, 201, 83`. Those two values differ
> slightly (the RGB converts to `#00C953`); we use `#00C853`.

## 4. Typography

| Role          | Family         | Token / class                  | Size (320px → large screens)   | Weight |
| ------------- | -------------- | ------------------------------ | ------------------------------ | ------ |
| Display       | **Montserrat** | `text-display`                 | 32 → 56 px (fluid)             | 800    |
| H1            | Montserrat     | `text-h1`                      | 28 → 40 px (fluid)             | 700    |
| H2            | Montserrat     | `text-h2`                      | 22 → 32 px (fluid)             | 700    |
| H3            | Montserrat     | `text-h3`                      | 18 → 24 px (fluid)             | 600    |
| H4            | Montserrat     | `text-h4`                      | 18 px                          | 600    |
| H5            | Montserrat     | `text-h5`                      | 16 px                          | 600    |
| Body          | **Inter**      | `text-body`                    | 16 px / 1.6                    | 400    |
| Body large    | Inter          | `text-body-lg`                 | 18 px                          | 400    |
| Small         | Inter          | `text-small`                   | 14 px                          | 400    |
| Caption       | Inter          | `text-caption`                 | 12 px                          | 400    |
| Navigation    | Inter          | `text-nav`                     | 15 px                          | 500    |
| Button        | Inter          | `text-button`                  | 15 px                          | 600    |
| Product title | Inter          | `text-product-title`           | 15 px, clamped to 2 lines      | 500    |
| Price         | Montserrat     | `text-price` / `text-price-lg` | 18 px / 24 → 32 px             | 700    |
| Discount      | Inter          | `text-discount`                | 13 px, `success-text`          | 600    |
| Badge         | Inter          | `text-badge`                   | 11 px, uppercase, +4% tracking | 700    |

- Fonts are self-hosted through `next/font`. There are no runtime requests to Google, and
  fallbacks are size-adjusted to prevent layout shift.
- Body text never goes below 16 px. That also stops iOS from zooming in on form inputs.
- Prices use tabular figures so amounts line up in lists and the cart.
- Headings use `text-wrap: balance` and paragraphs use `pretty`.

## 5. Spacing and layout

- **Base grid:** 4 px (the Tailwind spacing scale).
- **Page container:** `.container-page` has a maximum width of 1440 px with responsive gutters of 16, 24 or 32 px.
- **Other widths:** `max-w-prose` (760 px) for reading pages and `max-w-narrow` (480 px) for auth and checkout forms.
- **Section rhythm:** `py-section` (32 → 64 px) and `py-section-sm` (20 → 40 px).
- **Breakpoints:** `xs` 375 · `sm` 480 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 · `3xl` 1920.
  Designs are mobile-first and verified at every width from 320 px to 2560 px.
- On very wide screens the content stays centred at 1440 px, and extra width becomes margin.

## 6. Shape, elevation and motion

| Token                                               | Value                                                       |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `rounded-card` / `rounded-button` / `rounded-input` | 14 / 10 / 10 px                                             |
| `rounded-pill`                                      | Chips, round icon buttons, category images                  |
| `shadow-xs` → `shadow-lg`                           | Soft, navy-tinted. Cards are flat at rest and lift on hover |
| `duration-fast/base/slow`                           | 120 / 200 / 300 ms                                          |
| `ease-standard`                                     | `cubic-bezier(0.2, 0, 0, 1)`                                |
| `z-dropdown … z-tooltip`                            | Fixed layering scale; never use arbitrary z-index values    |

Motion is purposeful: hover feedback, drawer and sheet transitions, toasts and skeleton shimmer.
With `prefers-reduced-motion` enabled, all animation and transition times drop to 1 ms.
State changes stay visible, but nothing moves. Avoid heavy gradients, glassmorphism and
floating decoration.

## 7. Iconography

- Line icons from **Lucide**, 2 px stroke, rounded caps. Only the icons actually used are bundled.
- Sizes: `xs` 14 · `sm` 16 · `md` 20 · `lg` 24 · `xl` 32.
- The brand usage icons from the board are in `BRAND_ICONS`: Trust (ShieldCheck), Smart Shopping
  (ShoppingBag), Technology (Cpu), Convenience (Truck), Choice (LayoutGrid), Speed (Zap) and
  Growth (TrendingUp).
- Decorative icons get `aria-hidden`. An icon-only button always has an `aria-label`.

## 8. Brand pattern

The board's graphic style uses bold **diagonal blue and orange bands**. On the web this appears
as one or two angled stripes (about 25°) on hero banners and offer cards. Keep it subtle,
always behind the content and hidden where it would collide with text on small screens.

## 9. Components

All components live in `@seshakart/ui` (`packages/ui/src/components`). Domain cards that need
Next.js image optimisation or routing live in `apps/web/src/components/cards`.

| Component                                   | Variants and notes                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**                                  | `primary` (blue), `accent` (orange with navy text, for the main commerce CTA), `secondary` (navy), `outline`, `ghost`, `danger`, `link`. Sizes are `sm` 36, `md` 44 (default touch target), `lg` 52 and `icon`. `loading` disables the button and shows a spinner. Default `type="button"`. Use `buttonVariants()` to style links as buttons. Aliases: `ButtonPrimary`, `ButtonSecondary`, `ButtonOutline`, `ButtonDanger`. |
| **Badge**                                   | `DiscountBadge` (green), `DealBadge` (orange), `NewBadge` (blue), `BestSellerBadge` (navy), `StockBadge` (in stock, low stock or out of stock), plus neutral and info variants. Show at most two badges per product card.                                                                                                                                                                                                   |
| **Price**                                   | Selling price, struck-through MRP and discount, plus optional "You save". Screen readers hear "Price … MRP …". The discount is rounded **down** so savings are never overstated.                                                                                                                                                                                                                                            |
| **Rating**                                  | Read-only stars with value and count. Takes **real aggregated reviews only**, and is hidden when there are no reviews.                                                                                                                                                                                                                                                                                                      |
| **Card**                                    | White surface, 1 px border, 14 px radius. The `interactive` prop adds hover elevation.                                                                                                                                                                                                                                                                                                                                      |
| **ProductCard**                             | Square image frame (no layout shift), up to 2 badges, wishlist button, brand name, a 2-line title with a stretched link (the whole card is clickable with one tab stop), rating, price, stock state and an add-to-cart slot. It's a server component: only the action slots hydrate in the browser. Grid columns: 2 (mobile), 3 (tablet), 4 (laptop), 5 (≥ 1536 px).                                                        |
| **CategoryCard / OfferCard / BrandCard**    | Round category tiles. Offer tiles use themes (`primary`, `navy`, `accent`, `light`); admins choose a theme, never a raw colour. Brand logo tiles.                                                                                                                                                                                                                                                                           |
| **Form**                                    | `FormField` connects the label, hint and error to the control (`aria-describedby`, `aria-invalid`, `role="alert"` for errors). `Input`, `Textarea`, `Select` (native), `Checkbox`, `Radio` with 44 px rows.                                                                                                                                                                                                                 |
| **QuantityStepper**                         | − / value / + with bounds and labelled buttons ("Increase quantity of …").                                                                                                                                                                                                                                                                                                                                                  |
| **Modal / Drawer**                          | Built on the native `<dialog>`: focus trap, Escape, backdrop click, scroll lock and focus return. Drawer sides: `left` (navigation), `right` (cart), `bottom` (mobile filters and sort).                                                                                                                                                                                                                                    |
| **Toast**                                   | `ToastProvider` plus `useToast()`. Announced through a live region; errors use `role="alert"`. Sits above the mobile bottom navigation.                                                                                                                                                                                                                                                                                     |
| **Tooltip**                                 | Opens on hover and focus, closes with Escape. Supplementary information only.                                                                                                                                                                                                                                                                                                                                               |
| **DropdownMenu**                            | WAI-ARIA menu button: arrow keys, Home and End, Escape returns focus, outside click closes.                                                                                                                                                                                                                                                                                                                                 |
| **Alert / EmptyState / Skeleton / Spinner** | Feedback, empty states (always with a next action) and loading states.                                                                                                                                                                                                                                                                                                                                                      |

## 10. Mobile vs desktop behaviour

| Area           | Mobile (< 768 px)                                         | Desktop (≥ 1024 px)                                                |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Header         | Logo, search, cart and menu. The menu opens a left drawer | Logo, wide search, account, wishlist, cart and category navigation |
| Product grid   | 2 columns, 12 px gaps                                     | 4–5 columns, 16 px gaps                                            |
| Filters / sort | Bottom sheet with a sticky "Show results" button          | Sidebar                                                            |
| Purchase CTAs  | Sticky bottom bar on the product page                     | Inline next to the gallery                                         |
| Touch targets  | ≥ 44 px for primary controls, ≥ 24 px for everything      | Same                                                               |
| Decoration     | Pattern stripes hidden where they would crowd the text    | Pattern stripes on heroes and offer tiles                          |

## 11. Accessibility checklist (every component)

- Semantic HTML first. ARIA only where native elements can't express the behaviour.
- A visible focus ring (2 px `focus` blue, 2 px offset) on every interactive element.
- Colour is never the only signal: stock and discount states always include text.
- All pairings above meet 4.5:1 for text and 3:1 for UI.
- Motion respects `prefers-reduced-motion`.
- Automated checks: `packages/ui` unit tests cover contrast, ARIA wiring and keyboard
  behaviour. Browser QA in Phase 2 covered dialog focus management and target sizes at 16 widths.

## 12. Using the system beyond the web

- **Android and iOS apps:** import values from `tokens.ts`, or serialise it to JSON. Colours,
  type scale, radii and spacing map directly to Compose, SwiftUI or React Native themes.
- **Email:** use the horizontal logo (PNG), `navy` text on white, a `primary` link colour and
  `accent` CTA buttons with navy text. Use web-safe fallback fonts (Arial or Helvetica).
- **Social media and advertising:** navy or blue backgrounds with the diagonal pattern, the
  reversed logo, and orange for the key words in headlines (as in "Smart Shopping, **Better Living**").
- **Packaging, invoices and support:** the stacked logo with the tagline, navy on kraft or white,
  and orange used sparingly.
