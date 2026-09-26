import { Module } from '@nestjs/common';
import { hmac } from '../auth/crypto';
import { CartModule } from '../cart/cart.module';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../payments/gateways/gateway';
import { MockGateway } from '../payments/gateways/mock.gateway';
import { RazorpayGateway } from '../payments/gateways/razorpay.gateway';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PaymentsController, PaymentWebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CartModule],
  controllers: [CheckoutController, PaymentsController, PaymentWebhooksController],
  providers: [
    CheckoutService,
    PaymentsService,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ENV],
      // Env validation guarantees the credentials for real gateways and forbids the mock in production.
      useFactory: (env: Env): PaymentGateway =>
        env.PAYMENT_PROVIDER === 'razorpay'
          ? new RazorpayGateway(
              env.PAYMENT_KEY_ID!,
              env.PAYMENT_KEY_SECRET!,
              env.PAYMENT_WEBHOOK_SECRET!,
              env.PAYMENT_API_BASE,
            )
          : new MockGateway(hmac(env.SESSION_SECRET, 'mock-payment-gateway')),
    },
  ],
  exports: [PaymentsService, CheckoutService],
})
export class CheckoutModule {}
