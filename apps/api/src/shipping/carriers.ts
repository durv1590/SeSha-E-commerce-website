import type { Carrier } from '@seshakart/validation';

/**
 * Carriers staff can choose when recording a shipment. Tracking links are never
 * guessed: they come from the carrier integration or are pasted by staff.
 */
export const CARRIER_NAMES: Record<Carrier, string> = {
  delhivery: 'Delhivery',
  bluedart: 'Blue Dart',
  dtdc: 'DTDC',
  indiapost: 'India Post',
  shiprocket: 'Shiprocket',
  ecomexpress: 'Ecom Express',
  xpressbees: 'Xpressbees',
  other: 'Courier',
};

export function carrierName(carrier: string): string {
  return CARRIER_NAMES[carrier as Carrier] ?? carrier;
}

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Shipment created',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery attempt failed',
  RETURNED: 'Returned to seller',
};
