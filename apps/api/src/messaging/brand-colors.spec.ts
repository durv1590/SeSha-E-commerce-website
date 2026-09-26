import { colors as tokens } from '../../../../packages/ui/src/tokens';
import { colors } from './brand-colors';

describe('email brand colours', () => {
  it('match the design tokens', () => {
    expect(colors).toEqual({
      primary: tokens.primary,
      navy: tokens.navy,
      accentText: tokens['accent-text'],
      background: tokens.background,
      border: tokens.border,
      muted: tokens['text-muted'],
    });
  });
});
