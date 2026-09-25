import { cn } from './lib/cn';
import { contrastRatio } from './lib/contrast';
import { colors } from './tokens';

/**
 * Automated WCAG 2.2 AA check of every foreground/background pairing the design
 * system uses. If a brand colour changes, this test catches accessibility regressions.
 */
const AA_TEXT = 4.5;
const AA_LARGE_OR_UI = 3;

const textPairs: [keyof typeof colors, keyof typeof colors][] = [
  ['text-primary', 'surface'],
  ['text-primary', 'background'],
  ['text-secondary', 'surface'],
  ['text-secondary', 'background'],
  ['text-muted', 'surface'],
  ['text-muted', 'background'],
  ['text-inverse', 'primary'], // primary button
  ['text-inverse', 'primary-dark'], // primary button hover
  ['text-inverse', 'navy'], // navy surfaces, secondary button
  ['text-inverse', 'navy-light'],
  ['navy', 'accent'], // accent CTA button (white on orange fails AA)
  ['navy', 'accent-dark'],
  ['navy', 'success'],
  ['text-inverse', 'error'], // danger button
  ['primary', 'surface'], // links
  ['primary-dark', 'primary-light'],
  ['accent-text', 'surface'],
  ['accent-text', 'accent-light'],
  ['success-text', 'surface'],
  ['success-text', 'success-light'],
  ['warning-text', 'surface'],
  ['warning-text', 'warning-light'],
  ['error-text', 'surface'],
  ['error-text', 'error-light'],
  ['accent', 'navy'], // orange text on navy banners
];

describe('colour tokens meet WCAG AA', () => {
  it.each(textPairs)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('focus ring is visible against page and card surfaces (≥ 3:1)', () => {
    expect(contrastRatio(colors.focus, colors.surface)).toBeGreaterThanOrEqual(AA_LARGE_OR_UI);
    expect(contrastRatio(colors.focus, colors.background)).toBeGreaterThanOrEqual(AA_LARGE_OR_UI);
  });

  it('documents why white text is never used on accent orange or success green', () => {
    expect(contrastRatio(colors['text-inverse'], colors.accent)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(colors['text-inverse'], colors.success)).toBeLessThan(AA_TEXT);
  });
});

describe('cn', () => {
  it('keeps custom font sizes alongside text colours', () => {
    expect(cn('text-h2 text-navy')).toBe('text-h2 text-navy');
  });
  it('lets later classes override earlier ones', () => {
    expect(cn('bg-primary px-4', 'bg-accent')).toBe('px-4 bg-accent');
    expect(cn('text-small', 'text-h3')).toBe('text-h3');
    expect(cn('rounded-card', 'rounded-pill')).toBe('rounded-pill');
  });
});
