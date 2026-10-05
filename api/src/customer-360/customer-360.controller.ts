import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type {
  Customer360,
  CustomerSearchField,
  CustomerSearchRequest,
  CustomerSearchResponse,
  Locale,
} from '@agency-hub/shared';
import { CurrentUser, NoAudit, RequireFeature } from '../common/decorators/index.js';
import type { TenantUser } from '../common/request-user.js';
import { Customer360Service } from './customer-360.service.js';

const FIELDS: (CustomerSearchField | 'auto')[] = ['auto', 'nationalId', 'phone', 'policyNumber', 'name'];

class SearchDto implements CustomerSearchRequest {
  @IsString() @Length(2, 60) q!: string;
  @IsOptional() @IsIn(FIELDS) by?: CustomerSearchField | 'auto';
}

class IdParam {
  @Matches(/^[A-Za-z0-9_-]{1,64}$/) id!: string;
}

class LangQuery {
  @IsOptional() @IsIn(['he', 'en']) lang?: Locale;
}

/**
 * Customer search + 360° profile.
 * Search is POST so ID and phone numbers stay out of URLs, browser history and access logs.
 */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@RequireFeature('search.customer360')
export class Customer360Controller {
  constructor(private readonly service: Customer360Service) {}

  @Post('search')
  @HttpCode(200)
  @NoAudit()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@CurrentUser() user: TenantUser, @Body() dto: SearchDto, @Query() q: LangQuery): Promise<CustomerSearchResponse> {
    return this.service.search(user, dto, q.lang ?? 'he');
  }

  @Get(':id/profile')
  profile(
    @CurrentUser() user: TenantUser,
    @Param() p: IdParam,
    @Query() q: LangQuery,
  ): Promise<Customer360> {
    return this.service.getProfile(user, p.id, q.lang ?? 'he');
  }
}

@Module({ controllers: [Customer360Controller], providers: [Customer360Service] })
export class Customer360Module {}
