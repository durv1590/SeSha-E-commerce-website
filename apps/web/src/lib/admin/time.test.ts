import { describe, expect, it } from 'vitest';
import { fromLocalInput, toLocalInput } from './time';

describe('coupon date inputs (India time)', () => {
  it('round-trips an instant through a datetime-local value', () => {
    expect(toLocalInput('2026-10-01T18:30:00.000Z')).toBe('2026-10-02T00:00');
    expect(new Date(fromLocalInput('2026-10-02T00:00')!).toISOString()).toBe(
      '2026-10-01T18:30:00.000Z',
    );
    expect(toLocalInput(null)).toBe('');
    expect(fromLocalInput('')).toBeNull();
  });
});
