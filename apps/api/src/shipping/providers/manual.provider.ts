import type { CreatedShipment, ShipmentRequest, ShippingProvider } from './shipping-provider';

/** Staff book the courier themselves and enter the carrier and tracking number. */
export class ManualShippingProvider implements ShippingProvider {
  readonly id = 'manual';

  async createShipment(
    _request: ShipmentRequest,
    manual?: Partial<CreatedShipment>,
  ): Promise<CreatedShipment> {
    if (!manual?.carrier || !manual.trackingNumber)
      throw new Error('Carrier and tracking number are required');
    return {
      carrier: manual.carrier,
      trackingNumber: manual.trackingNumber,
      trackingUrl: manual.trackingUrl ?? null,
      providerShipmentId: null,
      estimatedDelivery: manual.estimatedDelivery ?? null,
    };
  }
}
