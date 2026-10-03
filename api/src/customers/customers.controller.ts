import { Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Customer, Paginated } from '@agency-hub/shared';
import { CurrentUser, RequireFeature } from '../common/decorators/index.js';
import { PageQueryDto } from '../common/pagination.js';
import type { TenantUser } from '../common/request-user.js';
import { CRM_PROVIDER, type CrmProvider } from '../integrations/provider.types.js';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@RequireFeature('module.customers')
export class CustomersController {
  constructor(@Inject(CRM_PROVIDER) private readonly crm: CrmProvider) {}

  @Get()
  list(@CurrentUser() user: TenantUser, @Query() q: PageQueryDto): Promise<Paginated<Customer>> {
    return this.crm.listCustomers({ tenantId: user.tenantId, locale: q.lang }, q);
  }
}

@Module({ controllers: [CustomersController] })
export class CustomersModule {}
