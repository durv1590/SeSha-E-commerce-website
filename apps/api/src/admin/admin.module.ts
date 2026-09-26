import { Module } from '@nestjs/common';
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
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Staff-only features. Every route is permission-gated; writes are audit-logged. */
@Module({
  controllers: [
    DashboardController,
    ProductAdminController,
    CategoryAdminController,
    BrandAdminController,
    InventoryAdminController,
  ],
  providers: [
    DashboardService,
    ProductAdminService,
    ProductCsvService,
    TaxonomyAdminService,
    InventoryAdminService,
  ],
})
export class AdminModule {}
