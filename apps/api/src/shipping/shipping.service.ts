import { Injectable } from '@nestjs/common';
import type { ServiceabilityDto } from '@seshakart/types';
import { SettingsService } from '../settings/settings.service';
import { assessPincode, deliveryWindow, type PincodeAssessment } from './estimate';

/** Serviceability and delivery estimates from the admin's shipping settings. */
@Injectable()
export class ShippingService {
  constructor(private readonly settings: SettingsService) {}

  async assess(pincode: string): Promise<PincodeAssessment> {
    return assessPincode(pincode, await this.settings.get('shipping'));
  }

  async window(pincode: string, method: 'STANDARD' | 'EXPRESS', from = new Date()) {
    return deliveryWindow(from, method, pincode, await this.settings.get('shipping'));
  }

  async serviceability(pincode: string, now = new Date()): Promise<ServiceabilityDto> {
    const s = await this.settings.get('shipping');
    const a = assessPincode(pincode, s);
    const standard = deliveryWindow(now, 'STANDARD', pincode, s);
    const express = deliveryWindow(now, 'EXPRESS', pincode, s);
    const commerce = await this.settings.get('commerce');
    const cod = a.codAvailable && commerce.codEnabled;
    return {
      pincode,
      serviceable: a.serviceable,
      codAvailable: cod,
      standard,
      express: commerce.expressEnabled ? express : null,
      message: !a.serviceable
        ? 'Sorry, we don’t deliver to this PIN code yet.'
        : cod
          ? 'Delivery available. Cash on delivery available.'
          : 'Delivery available. Pay online for this PIN code.',
    };
  }
}
