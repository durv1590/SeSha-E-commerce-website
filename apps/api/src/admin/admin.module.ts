import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Staff-only features. Every route is permission-gated; writes are audit-logged. */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class AdminModule {}
