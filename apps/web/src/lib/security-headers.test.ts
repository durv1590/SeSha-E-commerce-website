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

  it('allows Razorpay Checkout and nothing else from third parties', () => {
    const csp = buildContentSecurityPolicy({ isDev: false });
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline' https:\/\/checkout\.razorpay\.com;/);
    expect(csp).toContain('frame-src https://api.razorpay.com https://checkout.razorpay.com;');
    expect(csp).toContain("default-src 'self'");
  });

  it('allows analytics origins only for the configured tools', () => {
    const none = buildContentSecurityPolicy({ isDev: false });
    expect(none).not.toContain('googletagmanager');
    expect(none).not.toContain('facebook');
    const ga = buildContentSecurityPolicy({ isDev: false, analytics: { ga: true } });
    expect(ga).toMatch(/script-src [^;]*https:\/\/\*\.googletagmanager\.com/);
    expect(ga).toMatch(/connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
    expect(ga).not.toContain('facebook');
    const both = buildContentSecurityPolicy({ isDev: false, analytics: { ga: true, meta: true } });
    expect(both).toMatch(/script-src [^;]*https:\/\/connect\.facebook\.net/);
    expect(both).toMatch(/connect-src [^;]*https:\/\/www\.facebook\.com/);
    expect(both).toContain('frame-src https://api.razorpay.com https://checkout.razorpay.com;');
  });

  it('only enables HSTS outside development', () => {
    const names = (isDev: boolean) => securityHeaders({ isDev }).map((h) => h.key);
    expect(names(false)).toContain('Strict-Transport-Security');
    expect(names(true)).not.toContain('Strict-Transport-Security');
  });
});
