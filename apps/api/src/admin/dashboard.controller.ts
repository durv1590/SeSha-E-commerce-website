import { Controller, Get, Header } from '@nestjs/common';
import type { DashboardDto } from '@seshakart/types';
import { RequirePermissions } from '../auth/decorators';
import { DashboardService } from './dashboard.service';

@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions('dashboard:read')
  @Header('Cache-Control', 'no-store')
  get(): Promise<DashboardDto> {
    return this.dashboard.get();
  }
}
