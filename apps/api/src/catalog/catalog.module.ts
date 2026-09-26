import { Module } from '@nestjs/common';
import { BrandService } from './brand.service';
import { CatalogController } from './catalog.controller';
import { CategoryService } from './category.service';
import { HomeService } from './home.service';
import { ProductService } from './product.service';
import { SitemapService } from './sitemap.service';
import { SearchController } from '../search/search.controller';
import { SearchService } from '../search/search.service';

@Module({
  controllers: [CatalogController, SearchController],
  providers: [
    CategoryService,
    BrandService,
    ProductService,
    HomeService,
    SearchService,
    SitemapService,
  ],
  exports: [CategoryService, BrandService, ProductService, SearchService],
})
export class CatalogModule {}
