import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import {
  BrandAdminController,
  CategoryAdminController,
  InventoryAdminController,
  ProductAdminController,
} from './catalog/catalog-admin.controller';
import { InventoryAdminService } from './catalog/inventory-admin.service';
import { ProductAdminService } from './catalog/product-admin.service';
import { ProductCsvService } from './catalog/product-csv.service';
import { TaxonomyAdminService } from './catalog/taxonomy-admin.service';
import { ContentAdminController } from './content/content-admin.controller';
import { ContentAdminService } from './content/content-admin.service';
import { DashboardController } from './dashboard.controller';
import { CouponsAdminService } from './operations/coupons-admin.service';
import { CustomersAdminService } from './operations/customers-admin.service';
import {
  CouponsAdminController,
  CustomersAdminController,
  OrdersAdminController,
} from './operations/operations.controller';
import { OrdersAdminService } from './operations/orders-admin.service';
import { DashboardService } from './dashboard.service';

/** Staff-only features. Every route is permission-gated; writes are audit-logged. */
@Module({
  imports: [OrdersModule],
  controllers: [
    DashboardController,
    ProductAdminController,
    CategoryAdminController,
    BrandAdminController,
    InventoryAdminController,
    OrdersAdminController,
    CustomersAdminController,
    CouponsAdminController,
    ContentAdminController,
  ],
  providers: [
    DashboardService,
    ProductAdminService,
    ProductCsvService,
    TaxonomyAdminService,
    InventoryAdminService,
    OrdersAdminService,
    CustomersAdminService,
    CouponsAdminService,
    ContentAdminService,
  ],
})
export class AdminModule {}
