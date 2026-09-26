import {
  expandTokens,
  looksPersonal,
  normalizeQuery,
  toPrefixTsQuery,
  tokenize,
} from './normalize';

describe('search normalisation', () => {
  it('normalises case, accents, punctuation and hyphens', () => {
    expect(normalizeQuery('  Men’s  T-Shirt!! (Café) ')).toBe('men s t shirt cafe');
  });

  it('strips everything that could break a tsquery', () => {
    const tokens = tokenize(normalizeQuery(`earbuds' OR 1=1 --; & | ! :* ()`));
    expect(tokens).toEqual(['earbuds', 'or', '1']);
    expect(tokens.every((t) => /^[a-z0-9]+$/.test(t))).toBe(true);
  });

  it('limits tokens and length', () => {
    expect(tokenize(normalizeQuery('a b c d e f g h i j k'))).toHaveLength(8);
    expect(normalizeQuery('x'.repeat(500))).toHaveLength(100);
  });

  it('expands synonyms into OR groups with prefix matching', () => {
    const groups = expandTokens(['wireless', 'tshirt']);
    expect(groups).toEqual([['wireless'], ['tshirt', 'shirt']]);
    expect(toPrefixTsQuery(groups)).toBe('(wireless:*) & (tshirt:* | shirt:*)');
  });

  it('detects personal data that must not be logged', () => {
    expect(looksPersonal('asha@example.com')).toBe(true);
    expect(looksPersonal('98765 43210')).toBe(true);
    expect(looksPersonal('https://evil.example')).toBe(true);
    expect(looksPersonal('wireless earbuds 2024')).toBe(false);
  });
});
