/**
 * SeShaKart design tokens — the SINGLE source of truth for the visual language.
 *
 * Values are extracted from brand/seshakart-brand-reference.png and adjusted only
 * where WCAG 2.2 AA contrast requires it (see docs/BRAND_DESIGN_SYSTEM.md).
 *
 * - The Tailwind preset turns these into CSS custom properties (`--color-primary`, …)
 *   and utilities (`bg-primary`, `text-h2`, `rounded-card`, …).
 * - Plain TS export so future Android/iOS apps, email templates and marketing tools
 *   can consume the same values (e.g. by serialising to JSON).
 *
 * Never use raw colour values in components — always go through these tokens.
 */

export const colors = {
  // Brand
  primary: '#0B5FFF', // Primary Blue — links, primary buttons, brand presence
  'primary-dark': '#0847C2', // hover/pressed, blue text on tinted backgrounds
  'primary-light': '#E8F0FF', // tinted surfaces, selected states
  accent: '#FF8A00', // Accent Orange — CTAs, deals, highlights (pair with navy text)
  'accent-dark': '#E67A00', // hover/pressed for accent surfaces
  'accent-text': '#B35600', // orange-toned TEXT on light surfaces (AA compliant)
  'accent-light': '#FFF3E5',
  navy: '#0D1B2A', // Navy — headings, body text, dark brand surfaces
  'navy-light': '#1B2F45', // elevated elements on navy surfaces

  // Feedback
  success: '#00C853', // Success Green — icons, fills (pair with navy text)
  'success-text': '#007A33', // green TEXT on light surfaces (discounts, "In stock")
  'success-light': '#E6F9EE',
  warning: '#F5A524',
  'warning-text': '#B54708',
  'warning-light': '#FFF6E0',
  error: '#D92D20',
  'error-text': '#B42318',
  'error-light': '#FEEDEC',

  // Neutrals
  background: '#F4F7FB', // Light Gray — page background
  surface: '#FFFFFF', // cards, sheets, inputs
  'surface-muted': '#EEF2F8', // secondary surfaces, skeletons
  border: '#DCE3EE',
  'border-strong': '#B8C4D6',
  'text-primary': '#0D1B2A',
  'text-secondary': '#3E4C5E',
  'text-muted': '#5B6B7F',
  'text-inverse': '#FFFFFF',
  focus: '#0B5FFF',
} as const;

export type ColorToken = keyof typeof colors;

export const fonts = {
  heading: ['var(--font-heading)', 'Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  body: ['var(--font-body)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
} as const;

type FontSize = [string, { lineHeight: string; fontWeight?: string; letterSpacing?: string }];

/**
 * Type scale. Headings are fluid (clamp) so they stay readable from 320px phones
 * to 2560px displays without breakpoint jumps. Body text never drops below 16px
 * (also prevents iOS zoom on input focus).
 */
export const fontSizes: Record<string, FontSize> = {
  display: [
    'clamp(2rem, 1.35rem + 3.2vw, 3.5rem)',
    { lineHeight: '1.1', fontWeight: '800', letterSpacing: '-0.02em' },
  ],
  h1: [
    'clamp(1.75rem, 1.4rem + 1.8vw, 2.5rem)',
    { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.015em' },
  ],
  h2: [
    'clamp(1.375rem, 1.2rem + 1vw, 2rem)',
    { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.01em' },
  ],
  h3: ['clamp(1.125rem, 1.05rem + 0.5vw, 1.5rem)', { lineHeight: '1.3', fontWeight: '600' }],
  h4: ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
  h5: ['1rem', { lineHeight: '1.4', fontWeight: '600' }],
  'body-lg': ['1.125rem', { lineHeight: '1.65' }],
  body: ['1rem', { lineHeight: '1.6' }],
  small: ['0.875rem', { lineHeight: '1.5' }],
  caption: ['0.75rem', { lineHeight: '1.4' }],
  nav: ['0.9375rem', { lineHeight: '1.4', fontWeight: '500' }],
  button: ['0.9375rem', { lineHeight: '1.25', fontWeight: '600' }],
  'product-title': ['0.9375rem', { lineHeight: '1.4', fontWeight: '500' }],
  price: ['1.125rem', { lineHeight: '1.3', fontWeight: '700' }],
  'price-lg': ['clamp(1.5rem, 1.35rem + 0.8vw, 2rem)', { lineHeight: '1.2', fontWeight: '700' }],
  discount: ['0.8125rem', { lineHeight: '1.3', fontWeight: '600' }],
  badge: ['0.6875rem', { lineHeight: '1', fontWeight: '700', letterSpacing: '0.04em' }],
};

/** Breakpoints cover the required 320px → 2560px range. */
export const screens = {
  xs: '375px',
  sm: '480px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  '3xl': '1920px',
} as const;

export const containers = {
  /** Main content width; wider screens get more side space, not stretched grids. */
  page: '1440px',
  /** Reading width for policies, FAQs, articles. */
  prose: '760px',
  /** Forms: login, checkout steps. */
  narrow: '480px',
} as const;

/** Horizontal page gutter per breakpoint (mobile first). */
export const gutters = { base: '1rem', md: '1.5rem', xl: '2rem' } as const;

export const spacing = {
  /** Vertical rhythm between homepage/page sections. */
  section: 'clamp(2rem, 1.5rem + 2.5vw, 4rem)',
  'section-sm': 'clamp(1.25rem, 1rem + 1.25vw, 2.5rem)',
} as const;

export const radii = {
  xs: '4px',
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  card: '14px',
  button: '10px',
  input: '10px',
  pill: '9999px',
} as const;

/** Soft, navy-tinted elevation — used sparingly so products stay the focus. */
export const shadows = {
  xs: '0 1px 2px rgb(13 27 42 / 0.06)',
  sm: '0 1px 3px rgb(13 27 42 / 0.08), 0 1px 2px rgb(13 27 42 / 0.04)',
  md: '0 4px 12px rgb(13 27 42 / 0.08), 0 2px 4px rgb(13 27 42 / 0.04)',
  lg: '0 12px 32px rgb(13 27 42 / 0.12), 0 4px 8px rgb(13 27 42 / 0.05)',
  focus: '0 0 0 3px rgb(11 95 255 / 0.35)',
} as const;

export const motion = {
  duration: { fast: '120ms', base: '200ms', slow: '300ms' },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1.2)',
  },
} as const;

/** Layering scale — never use arbitrary z-index values. */
export const zIndex = {
  base: '0',
  raised: '10',
  dropdown: '20',
  sticky: '30',
  header: '40',
  overlay: '50',
  drawer: '60',
  modal: '70',
  toast: '80',
  tooltip: '90',
} as const;

/** Control heights. `md` is 44px — the minimum comfortable touch target. */
export const controlSizes = { sm: '2.25rem', md: '2.75rem', lg: '3.25rem' } as const;

export const iconSizes = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const;
export type IconSize = keyof typeof iconSizes;

export const tokens = {
  colors,
  fonts,
  fontSizes,
  screens,
  containers,
  gutters,
  spacing,
  radii,
  shadows,
  motion,
  zIndex,
  controlSizes,
  iconSizes,
} as const;
