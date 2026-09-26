import { Module } from '@nestjs/common';
import { BrandService } from './brand.service';
import { CatalogController } from './catalog.controller';
import { CategoryService } from './category.service';
import { HomeService } from './home.service';
import { ProductService } from './product.service';

@Module({
  controllers: [CatalogController],
  providers: [CategoryService, BrandService, ProductService, HomeService],
  exports: [CategoryService, BrandService, ProductService],
})
export class CatalogModule {}
