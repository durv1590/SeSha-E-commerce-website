import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { colors, fontSizes, radii, shadows } from '../tokens';

// Teach tailwind-merge about our custom tokens so e.g. `text-h2` (a font size) is not
// mistaken for a text *colour* and silently dropped when merged with `text-navy`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      colors: Object.keys(colors),
      borderRadius: Object.keys(radii),
    },
    classGroups: {
      'font-size': [{ text: Object.keys(fontSizes) }],
      shadow: [{ shadow: Object.keys(shadows) }],
    },
  },
});

/** Compose class names; later classes win over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
