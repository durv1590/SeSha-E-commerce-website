import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type {
  AdminBrandDto,
  AdminCategoryDto,
  AdminProductDto,
  AdminProductListItemDto,
  InventoryLedgerEntryDto,
  InventoryRowDto,
  ProductImportResultDto,
} from '@seshakart/types';
import {
  adminProductListQuerySchema,
  brandInputSchema,
  categoryInputSchema,
  idSchema,
  importQuerySchema,
  inventoryListQuerySchema,
  ledgerQuerySchema,
  lowStockThresholdSchema,
  productInputSchema,
  productStatusSchema,
  stockAdjustmentSchema,
  type AdminProductListQuery,
  type BrandInput,
  type CategoryInput,
  type InventoryListQuery,
  type ProductInput,
  type StockAdjustmentInput,
} from '@seshakart/validation';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import type { z } from 'zod';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth, RequireAnyPermission, RequirePermissions } from '../../auth/decorators';
import { Envelope } from '../../common/http/envelope';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe';
import { actorOf } from '../actor';
import { InventoryAdminService } from './inventory-admin.service';
import { ProductAdminService } from './product-admin.service';
import { MAX_IMPORT_BYTES, ProductCsvService } from './product-csv.service';
import { TaxonomyAdminService } from './taxonomy-admin.service';

/** Products: list, edit (details + variants + images), publish, delete, CSV. */
@Controller('admin/products')
export class ProductAdminController {
  constructor(
    private readonly products: ProductAdminService,
    private readonly csv: ProductCsvService,
  ) {}

  @Get()
  @RequirePermissions('products:read')
  @Header('Cache-Control', 'no-store')
  async list(
    @ZodQuery(adminProductListQuerySchema) q: AdminProductListQuery,
  ): Promise<Envelope<AdminProductListItemDto[]>> {
    const { data, meta } = await this.products.list(q);
    return new Envelope(data, meta);
  }

  @Get('export.csv')
  @RequirePermissions('products:read')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async export(@Res() res: Response): Promise<void> {
    const body = await this.csv.export();
    const date = new Date().toISOString().slice(0, 10);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="seshakart-products-${date}.csv"`,
        'Cache-Control': 'no-store',
      })
      // BOM so Excel opens UTF-8 (₹, accents) correctly.
      .send(`\uFEFF${body}`);
  }

  /** multipart/form-data with one `file` field; `?dryRun=false` applies the changes. */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('products:write')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 5 },
    }),
  )
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @ZodQuery(importQuerySchema) q: z.infer<typeof importQuerySchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<ProductImportResultDto> {
    return this.csv.import(file?.buffer, q.dryRun, actorOf(auth, req));
  }

  @Get(':id')
  @RequirePermissions('products:read')
  @Header('Cache-Control', 'no-store')
  get(@ZodParam('id', idSchema) id: string): Promise<AdminProductDto> {
    return this.products.get(id);
  }

  @Post()
  @RequirePermissions('products:write')
  create(
    @ZodBody(productInputSchema) body: ProductInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminProductDto> {
    return this.products.create(body, actorOf(auth, req));
  }

  @Put(':id')
  @RequirePermissions('products:write')
  update(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(productInputSchema) body: ProductInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminProductDto> {
    return this.products.update(id, body, actorOf(auth, req));
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('products:write')
  status(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(productStatusSchema) body: z.infer<typeof productStatusSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminProductDto> {
    return this.products.setStatus(id, body.status, actorOf(auth, req));
  }

  @Post(':id/duplicate')
  @RequirePermissions('products:write')
  duplicate(
    @ZodParam('id', idSchema) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminProductDto> {
    return this.products.duplicate(id, actorOf(auth, req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:delete')
  async remove(
    @ZodParam('id', idSchema) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.products.remove(id, actorOf(auth, req));
  }
}

@Controller('admin/categories')
export class CategoryAdminController {
  constructor(private readonly taxonomy: TaxonomyAdminService) {}

  /** Also used by the product editor, hence readable with products:read. */
  @Get()
  @RequireAnyPermission('products:read', 'categories:write')
  @Header('Cache-Control', 'no-store')
  list(): Promise<AdminCategoryDto[]> {
    return this.taxonomy.categories();
  }

  @Post()
  @RequirePermissions('categories:write')
  create(
    @ZodBody(categoryInputSchema) body: CategoryInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminCategoryDto> {
    return this.taxonomy.createCategory(body, actorOf(auth, req));
  }

  @Put(':id')
  @RequirePermissions('categories:write')
  update(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(categoryInputSchema) body: CategoryInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminCategoryDto> {
    return this.taxonomy.updateCategory(id, body, actorOf(auth, req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('categories:write')
  async remove(
    @ZodParam('id', idSchema) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.taxonomy.deleteCategory(id, actorOf(auth, req));
  }
}

@Controller('admin/brands')
export class BrandAdminController {
  constructor(private readonly taxonomy: TaxonomyAdminService) {}

  @Get()
  @RequireAnyPermission('products:read', 'brands:write')
  @Header('Cache-Control', 'no-store')
  list(): Promise<AdminBrandDto[]> {
    return this.taxonomy.brands();
  }

  @Post()
  @RequirePermissions('brands:write')
  create(
    @ZodBody(brandInputSchema) body: BrandInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminBrandDto> {
    return this.taxonomy.createBrand(body, actorOf(auth, req));
  }

  @Put(':id')
  @RequirePermissions('brands:write')
  update(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(brandInputSchema) body: BrandInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminBrandDto> {
    return this.taxonomy.updateBrand(id, body, actorOf(auth, req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('brands:write')
  async remove(
    @ZodParam('id', idSchema) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.taxonomy.deleteBrand(id, actorOf(auth, req));
  }
}

@Controller('admin/inventory')
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryAdminService) {}

  @Get()
  @RequirePermissions('inventory:read')
  @Header('Cache-Control', 'no-store')
  async list(
    @ZodQuery(inventoryListQuerySchema) q: InventoryListQuery,
  ): Promise<Envelope<InventoryRowDto[]>> {
    const { data, meta } = await this.inventory.list(q);
    return new Envelope(data, meta);
  }

  @Post(':variantId/adjust')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('inventory:write')
  adjust(
    @ZodParam('variantId', idSchema) variantId: string,
    @ZodBody(stockAdjustmentSchema) body: StockAdjustmentInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.inventory.adjust(variantId, body, actorOf(auth, req));
  }

  @Patch(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('inventory:write')
  async threshold(
    @ZodParam('variantId', idSchema) variantId: string,
    @ZodBody(lowStockThresholdSchema) body: z.infer<typeof lowStockThresholdSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.inventory.setThreshold(variantId, body.lowStockThreshold, actorOf(auth, req));
  }

  @Get(':variantId/ledger')
  @RequirePermissions('inventory:read')
  @Header('Cache-Control', 'no-store')
  async ledger(
    @ZodParam('variantId', idSchema) variantId: string,
    @ZodQuery(ledgerQuerySchema) q: z.infer<typeof ledgerQuerySchema>,
  ): Promise<Envelope<InventoryLedgerEntryDto[]>> {
    const { data, meta } = await this.inventory.ledger(variantId, q.page, q.pageSize);
    return new Envelope(data, meta);
  }
}
