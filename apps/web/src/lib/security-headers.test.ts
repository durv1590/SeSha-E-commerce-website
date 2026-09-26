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

  it('never upgrades requests on a plain-http site (local production QA)', () => {
    expect(buildContentSecurityPolicy({ isDev: false, https: false })).not.toContain(
      'upgrade-insecure-requests',
    );
    expect(securityHeaders({ isDev: false, https: false }).map((h) => h.key)).not.toContain(
      'Strict-Transport-Security',
    );
  });

  it('only enables HSTS outside development', () => {
    const names = (isDev: boolean) => securityHeaders({ isDev }).map((h) => h.key);
    expect(names(false)).toContain('Strict-Transport-Security');
    expect(names(true)).not.toContain('Strict-Transport-Security');
  });
});
