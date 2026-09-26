import { Controller, Get, Header } from '@nestjs/common';
import type { CmsPageDto, SeoOverrideDto } from '@seshakart/types';
import { slugSchema } from '@seshakart/validation';
import { ZodParam } from '../common/validation/zod.pipe';
import { ContentService } from './content.service';

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('pages')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  pages() {
    return this.content.pages();
  }

  @Get('pages/:slug')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  page(@ZodParam('slug', slugSchema) slug: string): Promise<CmsPageDto> {
    return this.content.page(slug);
  }

  @Get('seo-overrides')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  seo(): Promise<SeoOverrideDto[]> {
    return this.content.seoOverrides();
  }
}
