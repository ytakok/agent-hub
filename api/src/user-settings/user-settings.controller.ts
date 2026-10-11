import { Body, Controller, Get, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsIn, IsOptional, ValidateNested } from 'class-validator';
import type { DashboardRange, DashboardWidgetKey, Locale, UpdateUserSettingsRequest, UserSettings } from '@agency-hub/shared';
import { CurrentUser } from '../common/decorators/index.js';
import type { TenantUser } from '../common/request-user.js';
import { UserSettingsService } from './user-settings.service.js';

const LOCALES: Locale[] = ['he', 'en'];
const RANGES: DashboardRange[] = ['7d', '30d', '90d'];
const WIDGETS: DashboardWidgetKey[] = ['kpis', 'crmPipeline', 'sheets', 'gmail', 'whatsapp', 'renewals', 'activity', 'health'];

export class DashboardPrefsDto {
  @IsOptional() @IsIn(RANGES) defaultRange?: DashboardRange;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(WIDGETS, { each: true }) hiddenWidgets?: DashboardWidgetKey[];
}

export class UpdateUserSettingsDto {
  @IsOptional() @IsIn(LOCALES) language?: Locale;
  @IsOptional() @ValidateNested() @Type(() => DashboardPrefsDto) dashboard?: DashboardPrefsDto;
}

/** The caller's own settings only: the document id is always the verified uid, never a parameter. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me/settings')
export class UserSettingsController {
  constructor(private readonly settings: UserSettingsService) {}

  @Get()
  get(@CurrentUser() user: TenantUser): Promise<UserSettings> {
    return this.settings.get(user.uid);
  }

  @Patch()
  update(@CurrentUser() user: TenantUser, @Body() dto: UpdateUserSettingsDto): Promise<UserSettings> {
    return this.settings.update(user.uid, toUserSettingsPatch(dto));
  }
}

/**
 * Validated DTOs are class instances whose unsent fields exist as `undefined`; Firestore rejects both.
 * Copy only the fields that were sent into plain objects.
 */
export function toUserSettingsPatch(dto: UpdateUserSettingsDto): UpdateUserSettingsRequest {
  const patch: UpdateUserSettingsRequest = {};
  if (dto.language !== undefined) patch.language = dto.language;
  if (dto.dashboard) {
    const dashboard: NonNullable<UpdateUserSettingsRequest['dashboard']> = {};
    if (dto.dashboard.defaultRange !== undefined) dashboard.defaultRange = dto.dashboard.defaultRange;
    if (dto.dashboard.hiddenWidgets !== undefined) dashboard.hiddenWidgets = [...dto.dashboard.hiddenWidgets];
    patch.dashboard = dashboard;
  }
  return patch;
}

@Module({ controllers: [UserSettingsController], providers: [UserSettingsService] })
export class UserSettingsModule {}
