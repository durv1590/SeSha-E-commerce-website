import seshakartPreset from '@seshakart/ui/tailwind-preset';
import type { Config } from 'tailwindcss';

// All design values come from the shared SeShaKart preset (packages/ui/src/tokens.ts).
// Do not add raw colours or sizes here — extend the tokens instead.
const config: Config = {
  presets: [seshakartPreset as Config],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};

export default config;
