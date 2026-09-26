import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type {
  AdminBannerDto,
  AdminHomeSectionDto,
  AdminPageDto,
  AdminSeoOverrideDto,
} from '@seshakart/types';
import {
  bannerInputSchema,
  homeSectionInputSchema,
  idSchema,
  pageInputSchema,
  reorderSchema,
  seoOverrideInputSchema,
  settingsKeySchema,
  type BannerInput,
  type HomeSectionInput,
  type PageInput,
  type SeoOverrideInput,
  type SettingsKey,
} from '@seshakart/validation';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../../auth/decorators';
import { ZodBody, ZodParam, ZodValidationPipe } from '../../common/validation/zod.pipe';
import { actorOf } from '../actor';
import { ContentAdminService } from './content-admin.service';

const id = () => ZodParam('id', idSchema);

@Controller('admin')
export class ContentAdminController {
  constructor(private readonly content: ContentAdminService) {}

  // ------------------------------------------------------------------ banners
  @Get('banners')
  @RequirePermissions('content:write')
  @Header('Cache-Control', 'no-store')
  banners(): Promise<AdminBannerDto[]> {
    return this.content.banners();
  }

  @Post('banners')
  @RequirePermissions('content:write')
  createBanner(
    @ZodBody(bannerInputSchema) body: BannerInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.saveBanner(null, body, actorOf(auth, req));
  }

  @Put('banners/:id')
  @RequirePermissions('content:write')
  updateBanner(
    @id() bannerId: string,
    @ZodBody(bannerInputSchema) body: BannerInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.saveBanner(bannerId, body, actorOf(auth, req));
  }

  @Delete('banners/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('content:write')
  async deleteBanner(
    @id() bannerId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.content.deleteBanner(bannerId, actorOf(auth, req));
  }

  // ------------------------------------------------------------ home sections
  @Get('home-sections')
  @RequirePermissions('content:write')
  @Header('Cache-Control', 'no-store')
  sections(): Promise<AdminHomeSectionDto[]> {
    return this.content.sections();
  }

  @Post('home-sections')
  @RequirePermissions('content:write')
  createSection(
    @ZodBody(homeSectionInputSchema) body: HomeSectionInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.saveSection(null, body, actorOf(auth, req));
  }

  @Put('home-sections/order')
  @RequirePermissions('content:write')
  reorder(
    @ZodBody(reorderSchema) body: z.infer<typeof reorderSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.reorderSections(body.ids, actorOf(auth, req));
  }

  @Put('home-sections/:id')
  @RequirePermissions('content:write')
  updateSection(
    @id() sectionId: string,
    @ZodBody(homeSectionInputSchema) body: HomeSectionInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.saveSection(sectionId, body, actorOf(auth, req));
  }

  @Delete('home-sections/:id')
  @RequirePermissions('content:write')
  deleteSection(@id() sectionId: string, @CurrentAuth() auth: AuthContext, @Req() req: Request) {
    return this.content.deleteSection(sectionId, actorOf(auth, req));
  }

  // -------------------------------------------------------------------- pages
  @Get('pages')
  @RequirePermissions('content:write')
  @Header('Cache-Control', 'no-store')
  pages(): Promise<AdminPageDto[]> {
    return this.content.pages();
  }

  @Get('pages/:id')
  @RequirePermissions('content:write')
  @Header('Cache-Control', 'no-store')
  page(@id() pageId: string): Promise<AdminPageDto> {
    return this.content.page(pageId);
  }

  @Post('pages')
  @RequirePermissions('content:write')
  createPage(
    @ZodBody(pageInputSchema) body: PageInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.savePage(null, body, actorOf(auth, req));
  }

  @Put('pages/:id')
  @RequirePermissions('content:write')
  updatePage(
    @id() pageId: string,
    @ZodBody(pageInputSchema) body: PageInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.savePage(pageId, body, actorOf(auth, req));
  }

  @Delete('pages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('content:write')
  async deletePage(
    @id() pageId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.content.deletePage(pageId, actorOf(auth, req));
  }

  // ---------------------------------------------------------------------- SEO
  @Get('seo')
  @RequirePermissions('seo:write')
  @Header('Cache-Control', 'no-store')
  seo(): Promise<AdminSeoOverrideDto[]> {
    return this.content.seo();
  }

  @Post('seo')
  @RequirePermissions('seo:write')
  createSeo(
    @ZodBody(seoOverrideInputSchema) body: SeoOverrideInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.saveSeo(null, body, actorOf(auth, req));
  }

  @Put('seo/:id')
  @RequirePermissions('seo:write')
  updateSeo(
    @id() seoId: string,
    @ZodBody(seoOverrideInputSchema) body: SeoOverrideInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.saveSeo(seoId, body, actorOf(auth, req));
  }

  @Delete('seo/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('seo:write')
  async deleteSeo(
    @id() seoId: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.content.deleteSeo(seoId, actorOf(auth, req));
  }

  // ----------------------------------------------------------------- settings
  @Get('settings/:key')
  @RequirePermissions('settings:write')
  @Header('Cache-Control', 'no-store')
  getSettings(@Param('key', new ZodValidationPipe(settingsKeySchema)) key: SettingsKey) {
    return this.content.getSettings(key);
  }

  @Put('settings/:key')
  @RequirePermissions('settings:write')
  saveSettings(
    @Param('key', new ZodValidationPipe(settingsKeySchema)) key: SettingsKey,
    @Body() body: unknown,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.content.saveSettings(key, body, actorOf(auth, req));
  }
}
