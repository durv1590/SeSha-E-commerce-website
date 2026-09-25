import type { Config } from 'tailwindcss';

// Phase 1 baseline. The full SeShaKart design-token system (colours, type scale,
// spacing, radii, shadows) is introduced in Phase 2 — see docs/BRAND_DESIGN_SYSTEM.md.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
