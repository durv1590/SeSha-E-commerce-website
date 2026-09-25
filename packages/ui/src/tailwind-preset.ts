import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import {
  colors,
  containers,
  controlSizes,
  fontSizes,
  fonts,
  gutters,
  motion,
  radii,
  screens,
  shadows,
  spacing,
  zIndex,
} from './tokens';

function hexToChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** CSS custom properties emitted on :root — the runtime form of the tokens. */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, hex] of Object.entries(colors)) vars[`--color-${name}`] = hexToChannels(hex);
  for (const [name, value] of Object.entries(radii)) vars[`--radius-${name}`] = value;
  for (const [name, value] of Object.entries(shadows)) vars[`--shadow-${name}`] = value;
  for (const [name, value] of Object.entries(motion.duration)) vars[`--duration-${name}`] = value;
  for (const [name, value] of Object.entries(motion.easing)) vars[`--ease-${name}`] = value;
  for (const [name, value] of Object.entries(zIndex)) vars[`--z-${name}`] = value;
  for (const [name, value] of Object.entries(containers)) vars[`--container-${name}`] = value;
  for (const [name, value] of Object.entries(spacing)) vars[`--space-${name}`] = value;
  vars['--gutter'] = gutters.base;
  return vars;
}

const colorUtilities = Object.fromEntries(
  Object.keys(colors).map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
);

const preset: Partial<Config> = {
  theme: {
    screens: { ...screens },
    extend: {
      colors: colorUtilities,
      fontFamily: { heading: [...fonts.heading], body: [...fonts.body], sans: [...fonts.body] },
      fontSize: fontSizes,
      borderRadius: Object.fromEntries(Object.keys(radii).map((k) => [k, `var(--radius-${k})`])),
      boxShadow: Object.fromEntries(Object.keys(shadows).map((k) => [k, `var(--shadow-${k})`])),
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
      },
      zIndex: Object.fromEntries(Object.keys(zIndex).map((k) => [k, `var(--z-${k})`])),
      maxWidth: {
        page: 'var(--container-page)',
        prose: 'var(--container-prose)',
        narrow: 'var(--container-narrow)',
      },
      spacing: {
        section: 'var(--space-section)',
        'section-sm': 'var(--space-section-sm)',
        gutter: 'var(--gutter)',
        'control-sm': controlSizes.sm,
        'control-md': controlSizes.md,
        'control-lg': controlSizes.lg,
      },
      minHeight: { touch: controlSizes.md },
      minWidth: { touch: controlSizes.md },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        'fade-in': 'fade-in var(--duration-base) var(--ease-standard)',
        'slide-up': 'slide-up var(--duration-base) var(--ease-standard)',
        'slide-in-right': 'slide-in-right var(--duration-slow) var(--ease-standard)',
        'slide-in-left': 'slide-in-left var(--duration-slow) var(--ease-standard)',
      },
    },
  },
  plugins: [
    plugin(({ addBase, addComponents }) => {
      addBase({
        ':root': {
          ...cssVariables(),
          [`@media (min-width: ${screens.md})`]: { '--gutter': gutters.md },
          [`@media (min-width: ${screens.xl})`]: { '--gutter': gutters.xl },
        },
      });
      addComponents({
        /** Page container: max content width plus responsive gutters. */
        '.container-page': {
          width: '100%',
          maxWidth: 'var(--container-page)',
          marginInline: 'auto',
          paddingInline: 'var(--gutter)',
        },
        '.focus-ring': {
          outline: '2px solid rgb(var(--color-focus))',
          outlineOffset: '2px',
        },
      });
    }),
  ],
};

export default preset;
