import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { DashboardRange, DashboardSummary, Locale } from '@agency-hub/shared';
import { CurrentUser } from '../common/decorators/index.js';
import type { TenantUser } from '../common/request-user.js';
import { DashboardService } from './dashboard.service.js';

class SummaryQuery {
  @IsOptional() @IsIn(['7d', '30d', '90d']) range?: DashboardRange;
  /** Language for generated/mock content. Real sources return data as stored. */
  @IsOptional() @IsIn(['he', 'en']) lang?: Locale;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: TenantUser, @Query() q: SummaryQuery): Promise<DashboardSummary> {
    return this.dashboard.getSummary(user.tenantId, q.range ?? '30d', q.lang ?? 'he');
  }
}
