import { describe, expect, it } from 'vitest';
import { reportPresets } from './periods';

describe('report presets (India time)', () => {
  it('uses the India date, month boundaries and the April–March financial year', () => {
    // 26 Sept 2026, 23:00 UTC = 27 Sept 2026, 04:30 in India.
    const p = Object.fromEntries(
      reportPresets(new Date('2026-09-26T23:00:00Z')).map((x) => [x.key, x]),
    );
    expect(p['7d']).toMatchObject({ from: '2026-09-21', to: '2026-09-27' });
    expect(p.month).toMatchObject({ from: '2026-09-01', to: '2026-09-27' });
    expect(p['last-month']).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    expect(p.fy).toMatchObject({ label: 'FY 2026-27', from: '2026-04-01' });
    const jan = Object.fromEntries(
      reportPresets(new Date('2027-01-15T06:00:00Z')).map((x) => [x.key, x]),
    );
    expect(jan.fy).toMatchObject({ label: 'FY 2026-27', from: '2026-04-01', to: '2027-01-15' });
    expect(jan['last-month']).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
  });
});
