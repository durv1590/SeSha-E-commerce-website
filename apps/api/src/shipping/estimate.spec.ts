import { shippingSettingsSchema } from '@seshakart/validation';
import { addBusinessDays, assessPincode, deliveryWindow } from './estimate';

const settings = shippingSettingsSchema.parse({});

describe('delivery estimates', () => {
  it('skips Sundays and works in India time', () => {
    // Saturday 26 Sep 2026, 20:00 IST: the next business day is Monday the 28th.
    const saturdayEvening = new Date('2026-09-26T14:30:00Z');
    expect(addBusinessDays(saturdayEvening, 1).toISOString().slice(0, 10)).toBe('2026-09-28');
    // 00:01 IST on Sunday the 27th (still the 26th in UTC) never lands on the Sunday itself.
    expect(addBusinessDays(new Date('2026-09-26T18:31:00Z'), 0).toISOString().slice(0, 10)).toBe(
      '2026-09-28',
    );
  });

  it('gives standard and express windows, slower for remote PIN codes', () => {
    const now = new Date('2026-09-28T04:30:00Z'); // Monday 10:00 IST
    expect(deliveryWindow(now, 'STANDARD', '411001', settings)).toEqual({
      from: '2026-10-01',
      to: '2026-10-05',
    });
    expect(deliveryWindow(now, 'EXPRESS', '411001', settings)).toEqual({
      from: '2026-09-29',
      to: '2026-10-01',
    });
    expect(deliveryWindow(now, 'STANDARD', '744101', settings)).toEqual({
      from: '2026-10-03',
      to: '2026-10-07',
    });
    expect(deliveryWindow(now, 'EXPRESS', '744101', settings)).toBeNull();
  });

  it('assesses serviceability and cash on delivery from the settings', () => {
    expect(assessPincode('411001', settings)).toEqual({
      serviceable: true,
      remote: false,
      codAvailable: true,
      expressAvailable: true,
    });
    expect(assessPincode('744101', settings)).toMatchObject({
      remote: true,
      codAvailable: false,
      expressAvailable: false,
    });
    expect(assessPincode('011001', settings).serviceable).toBe(false);
    const blocked = { ...settings, blockedPrefixes: ['4110'] };
    expect(assessPincode('411001', blocked)).toMatchObject({
      serviceable: false,
      codAvailable: false,
    });
  });
});
