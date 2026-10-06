import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import type { DashboardWidgetKey, TenantRuntimeConfig, TenantSettings } from '@agency-hub/shared';
import { CurrentUser, PlatformAdminOnly, Roles } from '../common/decorators/index.js';
import type { TenantUser } from '../common/request-user.js';
import { TenantConfigService } from '../feature-flags/tenant-config.service.js';

const WIDGETS: DashboardWidgetKey[] = ['kpis', 'crmPipeline', 'sheets', 'gmail', 'whatsapp', 'renewals', 'activity', 'health'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class WorkingHoursDto {
  @Matches(TIME) start!: string;
  @Matches(TIME) end!: string;
  @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) days!: number[];
}

export class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(1) @Max(365) renewalWindowDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(168) messageSlaHours?: number;
  @IsOptional() @ValidateNested() @Type(() => WorkingHoursDto) workingHours?: WorkingHoursDto;
  @IsOptional() @IsString() defaultAssigneeUid?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(WIDGETS, { each: true }) dashboardWidgets?: DashboardWidgetKey[];
}

class UpdateFeaturesDto {
  /** `{ "integration.whatsapp": false, "module.messages": null }` — null clears an override. */
  @IsObject() overrides!: Record<string, boolean | null>;
}

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantConfig: TenantConfigService) {}

  /** Branding, effective feature flags and settings for the caller's organization. */
  @Get('current/config')
  getConfig(@CurrentUser() user: TenantUser): Promise<TenantRuntimeConfig> {
    return this.tenantConfig.getRuntimeConfig(user.tenantId);
  }

  @Patch('current/settings')
  @Roles('owner', 'admin')
  updateSettings(@CurrentUser() user: TenantUser, @Body() dto: UpdateSettingsDto): Promise<TenantRuntimeConfig> {
    return this.tenantConfig.updateSettings(user.tenantId, toSettingsPatch(dto));
  }

  /** Feature flags are commercial decisions (plans), so only the platform operator can override them. */
  @Patch(':tenantId/features')
  @PlatformAdminOnly()
  updateFeatures(
    @CurrentUser() user: TenantUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateFeaturesDto,
  ): Promise<TenantRuntimeConfig> {
    return this.tenantConfig.updateOverrides(tenantId, dto.overrides, user.uid);
  }
}

/**
 * Validated DTOs are class instances; Firestore only stores plain objects. Copy just the fields that were sent
 * (nested working hours included) so partial updates stay partial.
 */
export function toSettingsPatch(dto: UpdateSettingsDto): Partial<TenantSettings> {
  const patch: Partial<TenantSettings> = {};
  if (dto.renewalWindowDays !== undefined) patch.renewalWindowDays = dto.renewalWindowDays;
  if (dto.messageSlaHours !== undefined) patch.messageSlaHours = dto.messageSlaHours;
  if (dto.defaultAssigneeUid !== undefined) patch.defaultAssigneeUid = dto.defaultAssigneeUid;
  if (dto.workingHours) {
    patch.workingHours = { start: dto.workingHours.start, end: dto.workingHours.end, days: [...dto.workingHours.days] };
  }
  if (dto.dashboardWidgets) patch.dashboardWidgets = [...dto.dashboardWidgets];
  return patch;
}
