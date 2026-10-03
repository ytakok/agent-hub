import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureKey } from '@agency-hub/shared';
import { REQUIRED_FEATURES } from '../common/decorators/index.js';
import type { AuthedRequest } from '../common/request-user.js';
import { TenantConfigService } from './tenant-config.service.js';

/** Enforces @RequireFeature(...) against the caller's tenant flags. */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantConfig: TenantConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FeatureKey[] | undefined>(REQUIRED_FEATURES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const tenantId = ctx.switchToHttp().getRequest<AuthedRequest>().user?.tenantId;
    if (!tenantId || !(await this.tenantConfig.isEnabled(tenantId, ...required))) {
      throw new ForbiddenException({ message: 'Feature not enabled for this organization', error: 'FeatureDisabled' });
    }
    return true;
  }
}
