import { assertSafeKey } from './storage.service';

describe('storage keys', () => {
  it.each(['demo/products/earbuds-1.webp', 'products/2026/abc_123.jpg'])('accepts %s', (k) => {
    expect(() => assertSafeKey(k)).not.toThrow();
  });
  it.each([
    '../etc/passwd.png',
    'demo/../../x.webp',
    '/abs/x.webp',
    '.hidden.webp',
    'demo/x.svg',
    'demo/x.html',
    'Demo/X.webp',
  ])('rejects %s', (k) => {
    expect(() => assertSafeKey(k)).toThrow();
  });
});
