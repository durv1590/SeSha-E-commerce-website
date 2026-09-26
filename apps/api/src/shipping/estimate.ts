import type { ShippingSettings } from '@seshakart/validation';

const IST_OFFSET_MS = 330 * 60_000;

export interface DeliveryWindow {
  from: string;
  to: string;
}

export interface PincodeAssessment {
  serviceable: boolean;
  remote: boolean;
  codAvailable: boolean;
  expressAvailable: boolean;
}

const matches = (pincode: string, prefixes: string[]) =>
  prefixes.some((p) => pincode.startsWith(p));

/** What we can do for a PIN code, from the admin's shipping settings. */
export function assessPincode(pincode: string, s: ShippingSettings): PincodeAssessment {
  const serviceable = /^[1-9]\d{5}$/.test(pincode) && !matches(pincode, s.blockedPrefixes);
  const remote = matches(pincode, s.remotePrefixes);
  return {
    serviceable,
    remote,
    codAvailable: serviceable && !matches(pincode, s.codBlockedPrefixes),
    expressAvailable: serviceable && (!remote || s.expressToRemote),
  };
}

/** Adds business days (Monday–Saturday; couriers don't deliver on Sundays), in India time. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getTime() + IST_OFFSET_MS);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) left -= 1;
  }
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** ISO date (YYYY-MM-DD, India time) window for a delivery method. */
export function deliveryWindow(
  from: Date,
  method: 'STANDARD' | 'EXPRESS',
  pincode: string,
  s: ShippingSettings,
): DeliveryWindow | null {
  const a = assessPincode(pincode, s);
  if (!a.serviceable || (method === 'EXPRESS' && !a.expressAvailable)) return null;
  const range = method === 'EXPRESS' ? s.expressDays : s.standardDays;
  const extra = a.remote ? s.remoteExtraDays : 0;
  const day = (n: number) => addBusinessDays(from, n).toISOString().slice(0, 10);
  return { from: day(range.min + extra), to: day(range.max + extra) };
}
