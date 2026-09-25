import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, securityHeaders } from './security-headers';

describe('security headers', () => {
  it('blocks framing, plugins and foreign form targets', () => {
    const csp = buildContentSecurityPolicy({ isDev: false });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('only enables HSTS outside development', () => {
    const names = (isDev: boolean) => securityHeaders({ isDev }).map((h) => h.key);
    expect(names(false)).toContain('Strict-Transport-Security');
    expect(names(true)).not.toContain('Strict-Transport-Security');
  });
});
