import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AdminAlertDto,
  AdminReviewDto,
  AuditEntryDto,
  SalesReportDto,
  StaffMemberDto,
} from '@seshakart/types';
import {
  adminReviewListQuerySchema,
  auditQuerySchema,
  idSchema,
  reviewModerationSchema,
  salesReportQuerySchema,
  staffInviteSchema,
  staffUpdateSchema,
  type AdminReviewListQuery,
  type AuditQuery,
  type ReviewModerationInput,
  type SalesReportQuery,
  type StaffInviteInput,
  type StaffUpdateInput,
} from '@seshakart/validation';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../../auth/decorators';
import { Envelope } from '../../common/http/envelope';
import { ZodBody, ZodParam, ZodQuery, ZodValidationPipe } from '../../common/validation/zod.pipe';
import { actorOf } from '../actor';
import { EngagementAdminService } from './engagement-admin.service';
import { ReportsService } from './reports.service';

@Controller('admin')
export class EngagementAdminController {
  constructor(
    private readonly engagement: EngagementAdminService,
    private readonly reports: ReportsService,
  ) {}

  @Get('reviews')
  @RequirePermissions('reviews:moderate')
  @Header('Cache-Control', 'no-store')
  async reviews(
    @ZodQuery(adminReviewListQuerySchema) q: AdminReviewListQuery,
  ): Promise<Envelope<AdminReviewDto[]>> {
    const { data, meta } = await this.engagement.reviews(q);
    return new Envelope(data, meta);
  }

  @Post('reviews/:id/moderate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('reviews:moderate')
  async moderate(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(reviewModerationSchema) body: ReviewModerationInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.engagement.moderate(id, body, actorOf(auth, req));
  }

  @Get('alerts')
  @RequirePermissions('dashboard:read')
  @Header('Cache-Control', 'no-store')
  alerts(@CurrentAuth() auth: AuthContext): Promise<AdminAlertDto[]> {
    return this.engagement.alerts(auth.role);
  }

  @Get('audit')
  @RequirePermissions('audit:read')
  @Header('Cache-Control', 'no-store')
  async audit(@ZodQuery(auditQuerySchema) q: AuditQuery): Promise<Envelope<AuditEntryDto[]>> {
    const { data, meta } = await this.engagement.auditLog(q);
    return new Envelope(data, meta);
  }

  @Get('staff')
  @RequirePermissions('staff:write')
  @Header('Cache-Control', 'no-store')
  staff(@CurrentAuth() auth: AuthContext): Promise<StaffMemberDto[]> {
    return this.engagement.staff(auth.userId);
  }

  @Post('staff')
  @RequirePermissions('staff:write')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  invite(
    @ZodBody(staffInviteSchema) body: StaffInviteInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.engagement.invite(body, actorOf(auth, req));
  }

  @Put('staff/:id')
  @RequirePermissions('staff:write')
  updateStaff(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(staffUpdateSchema) body: StaffUpdateInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.engagement.updateStaff(id, body, actorOf(auth, req));
  }

  @Get('reports/sales')
  @RequirePermissions('analytics:read')
  @Header('Cache-Control', 'no-store')
  sales(@ZodQuery(salesReportQuerySchema) q: SalesReportQuery): Promise<SalesReportDto> {
    return this.reports.sales(q);
  }

  @Get('reports/sales.csv')
  @RequirePermissions('analytics:read')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async salesCsv(
    @Query(new ZodValidationPipe(salesReportQuerySchema)) q: SalesReportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const body = await this.reports.salesCsv(q);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="seshakart-sales-${q.from}-to-${q.to}.csv"`,
        'Cache-Control': 'no-store',
      })
      .send(`${String.fromCharCode(0xfeff)}${body}`);
  }
}
