import { canTransition, CUSTOMER_CANCELLABLE, timeline, TRANSITIONS } from './order-status';

describe('order state machine', () => {
  it('only moves forward along the lifecycle', () => {
    expect(canTransition('CONFIRMED', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransition('DELIVERED', 'SHIPPED')).toBe(false);
    expect(canTransition('REFUNDED', 'CONFIRMED')).toBe(false);
    expect(TRANSITIONS.REFUNDED).toEqual([]);
    expect(CUSTOMER_CANCELLABLE).not.toContain('PACKED');
  });

  it('every target status is itself a known status', () => {
    for (const targets of Object.values(TRANSITIONS))
      for (const t of targets) expect(Object.keys(TRANSITIONS)).toContain(t);
  });

  it('builds the customer timeline from history', () => {
    const t0 = new Date('2026-09-26T10:00:00Z');
    const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);
    const steps = timeline('SHIPPED', t0, [
      { toStatus: 'PENDING', createdAt: t0 },
      { toStatus: 'CONFIRMED', createdAt: at(1) },
      { toStatus: 'SHIPPED', createdAt: at(20) },
    ]);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['PLACED', true],
      ['CONFIRMED', true],
      ['SHIPPED', true],
      ['OUT_FOR_DELIVERY', false],
      ['DELIVERED', false],
    ]);
    expect(steps[2]!.at).toBe(at(20).toISOString());

    const cancelled = timeline('CANCELLED', t0, [
      { toStatus: 'PENDING', createdAt: t0 },
      { toStatus: 'CONFIRMED', createdAt: at(1) },
      { toStatus: 'CANCELLED', createdAt: at(2) },
    ]);
    expect(cancelled.filter((s) => s.done).map((s) => s.key)).toEqual(['PLACED', 'CONFIRMED']);
  });
});
