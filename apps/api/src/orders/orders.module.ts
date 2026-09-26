import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { InvoiceService } from '../invoices/invoice.service';
import { OrdersController, StaffOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CheckoutModule],
  controllers: [OrdersController, StaffOrdersController],
  providers: [OrdersService, InvoiceService],
  exports: [OrdersService],
})
export class OrdersModule {}
