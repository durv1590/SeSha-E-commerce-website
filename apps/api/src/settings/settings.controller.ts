import { Controller, Get, Header } from '@nestjs/common';
import { SettingsService } from './settings.service';

export interface PublicSettingsDto {
  storeName: string;
  legalName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  freeShippingThreshold: number;
  codEnabled: boolean;
}

/** Non-sensitive settings the storefront needs (announcement bar, footer, checkout copy). */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async public(): Promise<PublicSettingsDto> {
    const [store, commerce] = await Promise.all([
      this.settings.get('store'),
      this.settings.get('commerce'),
    ]);
    return {
      storeName: store.name,
      legalName: store.legalName,
      tagline: store.tagline,
      supportEmail: store.supportEmail,
      supportPhone: store.supportPhone,
      freeShippingThreshold: commerce.freeShippingThreshold,
      codEnabled: commerce.codEnabled,
    };
  }
}
