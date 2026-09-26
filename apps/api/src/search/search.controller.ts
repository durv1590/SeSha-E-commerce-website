import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { suggestQuerySchema } from '@seshakart/validation';
import type { z } from 'zod';
import { ZodQuery } from '../common/validation/zod.pipe';
import { SearchService, type PopularSearchesDto, type SuggestionsDto } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** As-you-type suggestions (products, categories, brands, completions). */
  @Get('suggest')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  suggest(
    @ZodQuery(suggestQuerySchema) query: z.infer<typeof suggestQuerySchema>,
  ): Promise<SuggestionsDto> {
    return this.search.suggest(query.q);
  }

  /** Admin-curated trending terms plus genuinely popular real searches. */
  @Get('popular')
  @Header('Cache-Control', 'public, max-age=300')
  popular(): Promise<PopularSearchesDto> {
    return this.search.popular();
  }
}
