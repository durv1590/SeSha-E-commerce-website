import { Controller, Get, Header } from '@nestjs/common';
import type {
  BrandDto,
  CategoryDetail,
  CategoryNode,
  HomePageDto,
  ProductDetail,
  ProductSummary,
  SitemapDto,
} from '@seshakart/types';
import { productListQuerySchema, slugSchema, type ProductListQuery } from '@seshakart/validation';
import { ZodParam, ZodQuery } from '../common/validation/zod.pipe';
import { BrandService } from './brand.service';
import { CategoryService } from './category.service';
import { HomeService } from './home.service';
import { ProductService } from './product.service';
import { SitemapService } from './sitemap.service';

/** Public, non-personalised data: safe for CDN caching. */
const PUBLIC_CACHE = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';

@Controller()
export class CatalogController {
  constructor(
    private readonly categories: CategoryService,
    private readonly brands: BrandService,
    private readonly products: ProductService,
    private readonly home: HomeService,
    private readonly sitemaps: SitemapService,
  ) {}

  @Get('home')
  @Header('Cache-Control', PUBLIC_CACHE)
  homePage(): Promise<HomePageDto> {
    return this.home.get();
  }

  @Get('categories')
  @Header('Cache-Control', PUBLIC_CACHE)
  categoryTree(): Promise<CategoryNode[]> {
    return this.categories.tree();
  }

  @Get('categories/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  category(@ZodParam('slug', slugSchema) slug: string): Promise<CategoryDetail> {
    return this.categories.detail(slug);
  }

  @Get('brands')
  @Header('Cache-Control', PUBLIC_CACHE)
  brandList(): Promise<BrandDto[]> {
    return this.brands.list();
  }

  @Get('brands/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  brand(@ZodParam('slug', slugSchema) slug: string): Promise<BrandDto> {
    return this.brands.bySlug(slug);
  }

  @Get('products')
  @Header('Cache-Control', PUBLIC_CACHE)
  productList(@ZodQuery(productListQuerySchema) query: ProductListQuery) {
    return this.products.list(query);
  }

  @Get('products/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  product(@ZodParam('slug', slugSchema) slug: string): Promise<ProductDetail> {
    return this.products.detail(slug);
  }

  @Get('products/:slug/related')
  @Header('Cache-Control', PUBLIC_CACHE)
  related(@ZodParam('slug', slugSchema) slug: string): Promise<ProductSummary[]> {
    return this.products.related(slug);
  }

  /** Every customer-visible URL for the storefront's sitemap.xml. */
  @Get('sitemap')
  @Header('Cache-Control', PUBLIC_CACHE)
  sitemap(): Promise<SitemapDto> {
    return this.sitemaps.get();
  }
}
