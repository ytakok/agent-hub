import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import type { ConnectSheetRequest, SheetsIntegrationStatus, SheetsTestResult } from '@agency-hub/shared';
import { CurrentUser, NoAudit, PlatformAdminOnly, RequireFeature, Roles } from '../../common/decorators/index.js';
import type { TenantUser } from '../../common/request-user.js';
import { SheetsIntegrationService } from './sheets-integration.service.js';

class ConnectSheetDto implements ConnectSheetRequest {
  /** Google Sheets URL or spreadsheet ID. */
  @IsString() @Length(20, 300) spreadsheet!: string;
  @IsOptional() @IsString() @Length(0, 100) sheetName?: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) headerRow?: number;
}

class TenantParam {
  @Matches(/^[A-Za-z0-9_-]{1,64}$/) tenantId!: string;
}

/** The signed-in organization's Google Sheets connection (owners and admins). */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations/sheets')
@RequireFeature('integration.sheets')
@Roles('owner', 'admin')
export class SheetsIntegrationController {
  constructor(private readonly sheets: SheetsIntegrationService) {}

  @Get()
  status(@CurrentUser() user: TenantUser): Promise<SheetsIntegrationStatus> {
    return this.sheets.status(user.tenantId);
  }

  /** Read-only check against Google; POST because it bypasses the cache, not because it changes data. */
  @Post('test')
  @HttpCode(200)
  @NoAudit()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(@CurrentUser() user: TenantUser): Promise<SheetsTestResult> {
    return this.sheets.test(user.tenantId);
  }
}

/**
 * Connecting a sheet is a platform-admin action: one service account can read every sheet shared with it,
 * so letting tenants type any spreadsheet ID would let one agency read another agency's sheet.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller('tenants/:tenantId/integrations/sheets')
@PlatformAdminOnly()
export class SheetsAdminController {
  constructor(private readonly sheets: SheetsIntegrationService) {}

  @Put()
  connect(@CurrentUser() user: TenantUser, @Param() p: TenantParam, @Body() dto: ConnectSheetDto): Promise<SheetsTestResult> {
    return this.sheets.connect(p.tenantId, { spreadsheet: dto.spreadsheet, sheetName: dto.sheetName, headerRow: dto.headerRow }, user.uid);
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@Param() p: TenantParam): Promise<void> {
    await this.sheets.disconnect(p.tenantId);
  }
}
