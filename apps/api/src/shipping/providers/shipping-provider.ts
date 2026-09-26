/**
 * Logistics integration contract. Each courier or aggregator (Shiprocket, Delhivery,
 * Blue Dart, DTDC, India Post…) implements this; the order workflow only talks to the
 * interface. The built-in ManualShippingProvider records what staff enter, so the
 * store can ship from day one and switch to an API integration without other changes.
 */
export interface ShipmentRequest {
  orderNumber: string;
  /** Delivery address snapshot from the order. */
  address: {
    name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  paymentMethod: 'PREPAID' | 'COD';
  /** Amount to collect for cash on delivery (paise). */
  codAmount: number;
  items: { sku: string; name: string; quantity: number; unitPrice: number }[];
  weightGrams: number | null;
  isReturn?: boolean;
}

export interface CreatedShipment {
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  providerShipmentId: string | null;
  estimatedDelivery: Date | null;
}

export interface TrackingEvent {
  status: 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED';
  location: string | null;
  note: string | null;
  at: Date;
}

export interface ShippingProvider {
  readonly id: string;
  /** Book a pickup / generate an AWB. Manual provider: echoes staff input. */
  createShipment(
    request: ShipmentRequest,
    manual?: Partial<CreatedShipment>,
  ): Promise<CreatedShipment>;
  /** Latest tracking events, for integrations that are polled. */
  track?(trackingNumber: string): Promise<TrackingEvent[]>;
  /** Live serviceability, for integrations that offer it (the store rules apply otherwise). */
  checkServiceability?(
    pincode: string,
    cod: boolean,
  ): Promise<{ serviceable: boolean; codAvailable: boolean }>;
  cancelShipment?(trackingNumber: string): Promise<void>;
}

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');
