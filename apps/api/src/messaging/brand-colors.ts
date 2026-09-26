/**
 * Brand colours for HTML emails. Emails need literal hex values (no CSS variables),
 * and the API can't import the web design-system source, so they are copied here.
 * `brand-colors.spec.ts` fails if they ever drift from packages/ui/src/tokens.ts.
 */
export const colors = {
  primary: '#0B5FFF',
  navy: '#0D1B2A',
  accentText: '#B35600',
  background: '#F4F7FB',
  border: '#DCE3EE',
  muted: '#5B6B7F',
} as const;
