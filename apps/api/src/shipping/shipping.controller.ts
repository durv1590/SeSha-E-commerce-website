import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ServiceabilityDto } from '@seshakart/types';
import { serviceabilityQuerySchema } from '@seshakart/validation';
import type { z } from 'zod';
import { ZodQuery } from '../common/validation/zod.pipe';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  /** PIN code checker: deliverable?, COD?, and expected delivery dates. */
  @Get('serviceability')
  @Header('Cache-Control', 'public, max-age=300')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  serviceability(
    @ZodQuery(serviceabilityQuerySchema) q: z.infer<typeof serviceabilityQuerySchema>,
  ): Promise<ServiceabilityDto> {
    return this.shipping.serviceability(q.pincode);
  }
}
