import { Global, Module } from '@nestjs/common';
import { ManualShippingProvider } from './providers/manual.provider';
import { SHIPPING_PROVIDER } from './providers/shipping-provider';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Global()
@Module({
  controllers: [ShippingController],
  // Swap in a courier/aggregator integration here; everything else uses the interface.
  providers: [ShippingService, { provide: SHIPPING_PROVIDER, useClass: ManualShippingProvider }],
  exports: [ShippingService, SHIPPING_PROVIDER],
})
export class ShippingModule {}
